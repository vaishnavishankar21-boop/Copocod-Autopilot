// src/mcp/server.ts
// =============================================================================
// Copado Nexus — MCP Server
// Exposes CLI commands as JSON-RPC tools for Claude Desktop / Google Antigravity
// Uses @modelcontextprotocol/sdk v1.x (stable) with stdio transport
// =============================================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// =============================================================================
// CRITICAL: Suppress all console.log to protect the JSON-RPC stdio channel.
// MCP communicates over stdout — any stray console.log WILL corrupt the stream.
// All internal diagnostics MUST use console.error (goes to stderr, not stdout).
// =============================================================================
const originalConsoleLog = console.log;
console.log = (...args: unknown[]) => {
  // Redirect all console.log to stderr so the JSON-RPC channel stays clean
  console.error("[MCP-REDIRECT stdout→stderr]", ...args);
};

// =============================================================================
// Log File Setup — persistent diagnostics without polluting stdio
// =============================================================================
const LOG_FILE = path.resolve(process.cwd(), ".copado-mcp.log");

function log(level: "INFO" | "WARN" | "ERROR", message: string, meta?: unknown): void {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` | ${JSON.stringify(meta)}` : "";
  const line = `[${timestamp}] [${level}] ${message}${metaStr}\n`;
  // Write to log file (non-blocking best effort)
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // Log file write failure should never crash the MCP server
  }
  // Also emit to stderr for live debugging via MCP Inspector
  console.error(line.trim());
}

// =============================================================================
// CLI Executor — runs copado-hx commands and captures stdout safely
// =============================================================================

const REPO_ROOT = path.resolve(__dirname, "..", "..");

/**
 * Determines the correct CLI command to invoke.
 * Resolves paths relative to this file to work regardless of where MCP server is launched.
 */
function getCliCommand(): string {
  const distPath = path.resolve(REPO_ROOT, "dist", "cli", "index.js");
  if (fs.existsSync(distPath)) {
    return `node "${distPath}"`;
  }
  // Dev fallback: run TypeScript directly via tsx
  return `npx tsx "${path.resolve(REPO_ROOT, "src", "cli", "index.ts")}"`;
}

interface CliResult {
  success: boolean;
  data: unknown;
  raw: string;
}

/**
 * Executes a copado-hx CLI subcommand and returns parsed JSON output.
 * Always appends --json so output is machine-readable.
 * Captures stderr separately to keep it out of the JSON-RPC content.
 */
function runCli(subcommand: string): CliResult {
  const baseCmd = getCliCommand();
  const fullCmd = `${baseCmd} ${subcommand} --json`;

  log("INFO", `Executing CLI: ${fullCmd}`);

  try {
    const stdout = execSync(fullCmd, {
      encoding: "utf-8",
      // Capture stderr into a buffer — never let it bleed into stdout
      stdio: ["pipe", "pipe", "pipe"],
      // 30-second timeout for long-running mock operations
      timeout: 30_000,
      env: {
        ...process.env,
        // Force non-interactive / CI mode so CLI never prompts for input
        CI: "true",
        NO_COLOR: "1",
      },
    });

    const raw = stdout.trim();
    log("INFO", `CLI stdout received`, { bytes: raw.length });

    // Parse the JSON output produced by the CLI's --json flag
    const data = JSON.parse(raw);
    return { success: true, data, raw };
  } catch (err: unknown) {
    // execSync throws on non-zero exit code.
    // The error object contains stdout/stderr from the failed process.
    const execError = err as {
      stdout?: string;
      stderr?: string;
      message?: string;
      status?: number;
    };

    const rawOutput = execError.stdout?.trim() || "";
    const stderrOutput = execError.stderr?.trim() || "";
    const exitCode = execError.status ?? -1;

    log("ERROR", `CLI exited with code ${exitCode}`, {
      stderr: stderrOutput,
      stdout: rawOutput,
      message: execError.message,
    });

    // Try to parse stdout as JSON even on non-zero exit (CLI may return structured errors)
    try {
      const data = JSON.parse(rawOutput);
      return { success: false, data, raw: rawOutput };
    } catch {
      // Raw output is not valid JSON — wrap in standard error envelope
      return {
        success: false,
        data: {
          error: true,
          message: execError.message ?? "CLI execution failed",
          stderr: stderrOutput,
          exitCode,
        },
        raw: rawOutput,
      };
    }
  }
}

// =============================================================================
// MCP Server Initialization
// =============================================================================

const server = new Server(
  {
    name: "copado-nexus",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

log("INFO", "Initializing Copado Nexus MCP Server v1.0.0");

// =============================================================================
// TOOL DEFINITIONS — ListToolsRequestSchema Handler
// Describes all available tools to the AI agent (Claude / Google Antigravity)
// =============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  log("INFO", "ListTools request received");

  return {
    tools: [
      // -----------------------------------------------------------------------
      // Tool 1: copado_auth_login
      // -----------------------------------------------------------------------
      {
        name: "copado_auth_login",
        description: "Authenticates with Copado using an API token and saves it securely.",
        inputSchema: {
          type: "object",
          properties: {
            token: {
              type: "string",
              description: "The Copado API token (e.g. 'mock-token-123').",
            },
          },
          required: ["token"],
          additionalProperties: false,
        },
      },

      // -----------------------------------------------------------------------
      // Tool 2: copado_auth_status
      // -----------------------------------------------------------------------
      {
        name: "copado_auth_status",
        description: "Checks current authentication status with Copado.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },

      // -----------------------------------------------------------------------
      // Tool 3: copado_story_set
      // -----------------------------------------------------------------------
      {
        name: "copado_story_set",
        description:
          "Sets the active Copado User Story ID in the local project context " +
          "(.copado-context.json). All subsequent operations (test runs, commits, " +
          "deployments) will be scoped to this story. Call this first before any " +
          "other operation in a new session.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description:
                "The Copado User Story ID to activate (e.g. 'US-1234'). " +
                "Must be a valid, existing story ID — never fabricate IDs.",
              pattern: "^[A-Za-z0-9_-]+$",
              minLength: 1,
              maxLength: 64,
            },
          },
          required: ["id"],
          additionalProperties: false,
        },
      },

      // -----------------------------------------------------------------------
      // Tool 4: copado_story_list
      // -----------------------------------------------------------------------
      {
        name: "copado_story_list",
        description: "Lists all available Salesforce User Stories in the Copado pipeline.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },

      // -----------------------------------------------------------------------
      // Tool 5: copado_story_show
      // -----------------------------------------------------------------------
      {
        name: "copado_story_show",
        description: "Displays the currently active Salesforce User Story context.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },

      // -----------------------------------------------------------------------
      // Tool 6: copado_commit
      // -----------------------------------------------------------------------
      {
        name: "copado_commit",
        description:
          "Commits staged Salesforce metadata changes for the currently active " +
          "User Story. Automatically scopes to active story or overrides via --us flag. " +
          "Triggers the Build agent pipeline.",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description:
                "A concise, descriptive commit message explaining the change " +
                "(e.g. 'feat: add validation rule for Account phone field'). " +
                "Follow conventional commit format where possible.",
              minLength: 5,
              maxLength: 256,
            },
            us: {
              type: "string",
              description: "Optional User Story ID to set context and run commit for.",
            },
          },
          required: ["message"],
          additionalProperties: false,
        },
      },

      // -----------------------------------------------------------------------
      // Tool 7: copado_promote
      // -----------------------------------------------------------------------
      {
        name: "copado_promote",
        description:
          "Promotes a user story to the next environment in the pipeline. " +
          "CRITICAL GUARDRAIL: For UAT or PROD targets, this tool returns a " +
          "HUMAN_APPROVAL_REQUIRED response with a one-time approval code. " +
          "You MUST display that code to the developer and ask them to type it " +
          "back to confirm. A prior instruction like 'if tests pass, deploy to UAT' " +
          "does NOT count as approval — you must receive a live, in-chat response. " +
          "Only then call 'copado_approve_action' with the code they provided.",
        inputSchema: {
          type: "object",
          properties: {
            env: {
              type: "string",
              description: "Target environment name (e.g. 'UAT', 'SIT', 'PROD').",
            },
            validate: {
              type: "boolean",
              description: "Run a validation-only deployment (no actual deploy).",
            },
          },
          required: ["env"],
          additionalProperties: false,
        },
      },

      // -----------------------------------------------------------------------
      // Tool 8: copado_deploy
      // -----------------------------------------------------------------------
      {
        name: "copado_deploy",
        description:
          "Deploys a user story to the target environment. " +
          "CRITICAL GUARDRAIL: For UAT or PROD targets, this tool returns a " +
          "HUMAN_APPROVAL_REQUIRED response with a one-time approval code. " +
          "You MUST display that code to the developer and ask them to type it " +
          "back to confirm. A prior instruction like 'if tests pass, deploy to UAT' " +
          "does NOT count as approval — you must receive a live, in-chat response. " +
          "Only then call 'copado_approve_action' with the code they provided.",
        inputSchema: {
          type: "object",
          properties: {
            env: {
              type: "string",
              description: "Target environment name (e.g. 'UAT', 'PROD').",
            },
          },
          required: ["env"],
          additionalProperties: false,
        },
      },

      // -----------------------------------------------------------------------
      // Tool 8.5: copado_approve_action
      // -----------------------------------------------------------------------
      {
        name: "copado_approve_action",
        description:
          "Executes a previously gated destructive action after receiving explicit human consent. " +
          "CRITICAL: You must NOT call this automatically. The required sequence is: " +
          "(1) copado_promote/deploy returns a HUMAN_APPROVAL_REQUIRED with an approval code, " +
          "(2) You show the code to the developer and say 'Please type this code to confirm: <CODE>', " +
          "(3) The developer types the code in the chat, " +
          "(4) ONLY THEN call this tool with the code they typed. " +
          "Using the token you received without a live developer response is a guardrail violation.",
        inputSchema: {
          type: "object",
          properties: {
            token: {
              type: "string",
              description: "The approval code typed by the human developer in the chat.",
            },
          },
          required: ["token"],
          additionalProperties: false,
        },
      },

      // -----------------------------------------------------------------------
      // Tool 9: copado_test_run
      // -----------------------------------------------------------------------
      {
        name: "copado_test_run",
        description:
          "Triggers a Copado Robotic Testing (CRT) job by its Job ID or Suite ID and returns " +
          "the execution ID and status. Use this to validate changes before any " +
          "deployment. IMPORTANT: Do NOT auto-retry failed tests — surface the " +
          "failure to the human operator and await instructions.",
        inputSchema: {
          type: "object",
          properties: {
            jobId: {
              type: "string",
              description:
                "The CRT Job ID to execute (e.g. 'JOB-SMOKE-001').",
            },
            suiteId: {
              type: "string",
              description:
                "The CRT Suite ID to execute (alias for jobId, e.g. 'JOB-SMOKE-2026').",
            },
          },
          additionalProperties: false,
        },
      },

      // -----------------------------------------------------------------------
      // Tool 10: copado_test_status
      // -----------------------------------------------------------------------
      {
        name: "copado_test_status",
        description: "Polls the status of a specific robotic test execution.",
        inputSchema: {
          type: "object",
          properties: {
            executionId: {
              type: "string",
              description: "The test run execution ID to query status for.",
            },
            watch: {
              type: "boolean",
              description: "Poll status continuously until completion.",
            },
          },
          required: ["executionId"],
          additionalProperties: false,
        },
      },

      // -----------------------------------------------------------------------
      // Tool 11: copado_test_results
      // -----------------------------------------------------------------------
      {
        name: "copado_test_results",
        description: "Retrieves the test result details (e.g. Succeeded/Failed) of a completed robotic test execution.",
        inputSchema: {
          type: "object",
          properties: {
            executionId: {
              type: "string",
              description: "The test run execution ID to retrieve results for.",
            },
          },
          required: ["executionId"],
          additionalProperties: false,
        },
      },

      // -----------------------------------------------------------------------
      // Tool 12: copado_test_list
      // -----------------------------------------------------------------------
      {
        name: "copado_test_list",
        description: "Lists all available robotic test suites/jobs.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },

      // -----------------------------------------------------------------------
      // Tool 13: copado_status
      // -----------------------------------------------------------------------
      {
        name: "copado_status",
        description: "Get the status of the last tracked execution job or a specific job ID.",
        inputSchema: {
          type: "object",
          properties: {
            job: {
              type: "string",
              description: "Optional job execution ID to check status for.",
            },
            watch: {
              type: "boolean",
              description: "Poll status continuously until completion.",
            },
          },
          additionalProperties: false,
        },
      },

      // -----------------------------------------------------------------------
      // Tool 14: copado_ai_ask
      // -----------------------------------------------------------------------
      {
        name: "copado_ai_ask",
        description:
          "Sends a natural language prompt to one of the five Copado AI Agents " +
          "and returns its structured response. " +
          "Agents: " +
          "'plan' (story analysis, requirements), " +
          "'build' (code generation, metadata operations), " +
          "'test' (test strategy, CRT configuration), " +
          "'release' (deployment planning — ALWAYS requires human approval for PROD/UAT), " +
          "'operate' (post-deployment monitoring, incident triage).",
        inputSchema: {
          type: "object",
          properties: {
            agent: {
              type: "string",
              description: "The Copado AI Agent to invoke.",
              enum: ["plan", "build", "test", "release", "operate"],
            },
            prompt: {
              type: "string",
              description:
                "The natural language instruction or question for the agent. " +
                "Be specific and include all relevant context (story ID, org alias, etc.).",
              minLength: 3,
              maxLength: 2000,
            },
          },
          required: ["agent", "prompt"],
          additionalProperties: false,
        },
      },
    ],
  };
});

// =============================================================================
// TOOL EXECUTION — CallToolRequestSchema Handler
// Routes incoming tool calls → CLI subcommands → parses output → MCP content
// =============================================================================

// Track pending destructive actions that need human approval
const pendingApprovals = new Map<string, string>();

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  log("INFO", `CallTool invoked: ${name}`, { args });

  // Validate that arguments object exists
  if (!args || typeof args !== "object") {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Tool '${name}' requires an arguments object.`
    );
  }

  // -------------------------------------------------------------------------
  // Helper: Format the CLI result into a valid MCP content block array
  // -------------------------------------------------------------------------
  function buildContent(result: CliResult): { type: "text"; text: string }[] {
    const payload = {
      tool: name,
      success: result.success,
      // The CLI always returns JSON under --json flag; embed it directly
      result: result.data,
    };
    return [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Route each tool name to its corresponding CLI subcommand
  // -------------------------------------------------------------------------
  switch (name) {
    // -----------------------------------------------------------------------
    case "copado_auth_login": {
      const token = args["token"];
      if (typeof token !== "string" || token.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "copado_auth_login requires a non-empty 'token' string."
        );
      }
      const safeToken = token.replace(/[^A-Za-z0-9_\-]/g, "");
      const result = runCli(`auth login --token ${safeToken}`);
      return { content: buildContent(result) };
    }

    // -----------------------------------------------------------------------
    case "copado_auth_status": {
      const result = runCli("auth status");
      return { content: buildContent(result) };
    }

    // -----------------------------------------------------------------------
    case "copado_story_set": {
      const id = args["id"];
      if (typeof id !== "string" || id.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "copado_story_set requires a non-empty 'id' string."
        );
      }

      // Sanitize: strip any characters that could enable shell injection
      const safeId = id.replace(/[^A-Za-z0-9_\-]/g, "");
      if (safeId !== id) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Story ID '${id}' contains invalid characters. Use alphanumeric, hyphens, or underscores only.`
        );
      }

      const result = runCli(`story set --id ${safeId}`);
      return { content: buildContent(result) };
    }

    // -----------------------------------------------------------------------
    case "copado_story_list": {
      const result = runCli("story list");
      return { content: buildContent(result) };
    }

    // -----------------------------------------------------------------------
    case "copado_story_show": {
      const result = runCli("story show");
      return { content: buildContent(result) };
    }

    // -----------------------------------------------------------------------
    case "copado_commit": {
      const message = args["message"];
      const us = args["us"];
      if (typeof message !== "string" || message.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "copado_commit requires a non-empty 'message' string."
        );
      }

      // Wrap message in single quotes and escape any internal single quotes
      const safeMessage = message.replace(/'/g, `'\\''`);
      let cmd = `commit --message '${safeMessage}'`;
      if (us) {
        if (typeof us !== "string" || !/^[A-Za-z0-9_\-]+$/.test(us)) {
          throw new McpError(ErrorCode.InvalidParams, "Invalid 'us' story ID.");
        }
        cmd += ` --us ${us}`;
      }
      const result = runCli(cmd);
      return { content: buildContent(result) };
    }

    // -----------------------------------------------------------------------
    // -----------------------------------------------------------------------
    case "copado_promote": {
      const env = args["env"];
      const validate = args["validate"];
      if (typeof env !== "string" || env.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "copado_promote requires a non-empty 'env' string."
        );
      }
      const safeEnv = env.replace(/[^A-Za-z0-9_\-]/g, "");
      let cmd = `promote --env ${safeEnv}`;
      if (validate) {
        cmd += " --validate";
      }

      if (safeEnv.toUpperCase() === "UAT" || safeEnv.toUpperCase() === "PROD") {
        const token = Math.random().toString(36).substring(2, 10).toUpperCase();
        pendingApprovals.set(token, `${cmd} --confirm`);
        log("WARN", `HUMAN_APPROVAL_REQUIRED for promote to ${safeEnv}`, { token });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              tool: name,
              success: false,
              error: "HUMAN_APPROVAL_REQUIRED",
              approvalCode: token,
              message:
                `⛔ GUARDRAIL: Promote to ${safeEnv} requires explicit human approval. ` +
                `A prior instruction ('if tests pass, deploy...') does NOT count. ` +
                `You must present the approval code to the developer and wait for their live response.`,
              requiredAction:
                `STOP tool execution. Display this message to the developer verbatim: ` +
                `"✅ Tests passed for US-${safeEnv}! To authorize the ${safeEnv} promotion, ` +
                `please type the following approval code: **${token}** ` +
                `(or type 'cancel' to abort).". ` +
                `Do NOT call copado_approve_action until the developer types the code in the chat.`
            }, null, 2)
          }]
        };
      }

      const result = runCli(cmd);
      return { content: buildContent(result) };
    }

    // -----------------------------------------------------------------------
    case "copado_deploy": {
      const env = args["env"];
      if (typeof env !== "string" || env.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "copado_deploy requires a non-empty 'env' string."
        );
      }
      const safeEnv = env.replace(/[^A-Za-z0-9_\-]/g, "");
      let cmd = `deploy --env ${safeEnv}`;

      if (safeEnv.toUpperCase() === "UAT" || safeEnv.toUpperCase() === "PROD") {
        const token = Math.random().toString(36).substring(2, 10).toUpperCase();
        pendingApprovals.set(token, `${cmd} --confirm`);
        log("WARN", `HUMAN_APPROVAL_REQUIRED for deploy to ${safeEnv}`, { token });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              tool: name,
              success: false,
              error: "HUMAN_APPROVAL_REQUIRED",
              approvalCode: token,
              message:
                `⛔ GUARDRAIL: Deploy to ${safeEnv} requires explicit human approval. ` +
                `A prior instruction ('if tests pass, deploy...') does NOT count. ` +
                `You must present the approval code to the developer and wait for their live response.`,
              requiredAction:
                `STOP tool execution. Display this message to the developer verbatim: ` +
                `"✅ Tests passed! To authorize the ${safeEnv} deployment, ` +
                `please type the following approval code: **${token}** ` +
                `(or type 'cancel' to abort).". ` +
                `Do NOT call copado_approve_action until the developer types the code in the chat.`
            }, null, 2)
          }]
        };
      }

      const result = runCli(cmd);
      return { content: buildContent(result) };
    }

    // -----------------------------------------------------------------------
    case "copado_approve_action": {
      const token = args["token"];
      if (typeof token !== "string" || token.trim() === "") {
        throw new McpError(ErrorCode.InvalidParams, "Token is required.");
      }
      const cmd = pendingApprovals.get(token);
      if (!cmd) {
        throw new McpError(ErrorCode.InvalidParams, "Invalid or expired token.");
      }
      pendingApprovals.delete(token); // one-time use
      const result = runCli(cmd);
      return { content: buildContent(result) };
    }

    // -----------------------------------------------------------------------
    case "copado_test_run": {
      const jobId = args["jobId"];
      const suiteId = args["suiteId"];
      const targetJob = jobId || suiteId;
      if (typeof targetJob !== "string" || targetJob.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "copado_test_run requires a non-empty 'jobId' or 'suiteId' string."
        );
      }

      // Sanitize job ID
      const safeJobId = targetJob.replace(/[^A-Za-z0-9_\-]/g, "");
      if (safeJobId !== targetJob) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Job/Suite ID '${targetJob}' contains invalid characters.`
        );
      }

      const result = runCli(`test run --job ${safeJobId}`);
      return { content: buildContent(result) };
    }

    // -----------------------------------------------------------------------
    case "copado_test_status": {
      const executionId = args["executionId"];
      const watch = args["watch"];
      if (typeof executionId !== "string" || executionId.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "copado_test_status requires a non-empty 'executionId' string."
        );
      }
      const safeExecutionId = executionId.replace(/[^A-Za-z0-9_\-]/g, "");
      let cmd = `test status --execution ${safeExecutionId}`;
      if (watch) {
        cmd += " --watch";
      }
      const result = runCli(cmd);
      return { content: buildContent(result) };
    }

    // -----------------------------------------------------------------------
    case "copado_test_results": {
      const executionId = args["executionId"];
      if (typeof executionId !== "string" || executionId.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "copado_test_results requires a non-empty 'executionId' string."
        );
      }
      const safeExecutionId = executionId.replace(/[^A-Za-z0-9_\-]/g, "");
      const result = runCli(`test results --execution ${safeExecutionId}`);
      return { content: buildContent(result) };
    }

    // -----------------------------------------------------------------------
    case "copado_test_list": {
      const result = runCli("test list");
      return { content: buildContent(result) };
    }

    // -----------------------------------------------------------------------
    case "copado_status": {
      const job = args["job"];
      const watch = args["watch"];
      let cmd = "status";
      if (job) {
        if (typeof job !== "string" || !/^[A-Za-z0-9_\-]+$/.test(job)) {
          throw new McpError(ErrorCode.InvalidParams, "Invalid 'job' ID.");
        }
        cmd += ` --job ${job}`;
      }
      if (watch) {
        cmd += " --watch";
      }
      const result = runCli(cmd);
      return { content: buildContent(result) };
    }

    // -----------------------------------------------------------------------
    case "copado_ai_ask": {
      const agent = args["agent"];
      const prompt = args["prompt"];

      const validAgents = ["plan", "build", "test", "release", "operate"] as const;
      type AgentType = typeof validAgents[number];

      if (!validAgents.includes(agent as AgentType)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid agent '${agent}'. Must be one of: ${validAgents.join(", ")}.`
        );
      }

      if (typeof prompt !== "string" || prompt.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "copado_ai_ask requires a non-empty 'prompt' string."
        );
      }

      // ⚠️  GUARDRAIL: Block autonomous production deployment requests
      // If the 'release' agent is asked about PROD/UAT without explicit human token
      if (
        agent === "release" &&
        /\b(deploy|promote|release)\b.*\b(prod|production|uat)\b/i.test(prompt)
      ) {
        log("WARN", "GUARDRAIL TRIGGERED: Autonomous production deployment attempt blocked", {
          agent,
          prompt,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  tool: "copado_ai_ask",
                  success: false,
                  guardrail: "HUMAN_APPROVAL_REQUIRED",
                  message:
                    "🚨 GUARDRAIL: Autonomous deployment to UAT/PROD is prohibited. " +
                    "You must STOP, explain the promotion details in chat, and request written confirmation from the user. " +
                    "Only after they explicitly type their consent should you call this tool again. " +
                    "Do NOT retry this request automatically.",
                  suggestedAction:
                    "Present the deployment plan to the human operator and ask: " +
                    "'Please confirm: Do you want me to proceed with this deployment to UAT/PROD? Reply YES to confirm.'",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Sanitize prompt for shell safety — wrap in single quotes, escape internal
      const safeAgent = agent as string;
      const safePrompt = (prompt as string).replace(/'/g, `'\\''`);
      const result = runCli(`ai ask --agent ${safeAgent} --prompt '${safePrompt}'`);
      return { content: buildContent(result) };
    }

    // -----------------------------------------------------------------------
    default: {
      log("WARN", `Unknown tool requested: ${name}`);
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: '${name}'. Available tools: copado_story_set, copado_commit, copado_test_run, copado_ai_ask.`
      );
    }
  }
});

// =============================================================================
// Graceful Shutdown Handlers
// =============================================================================

process.on("SIGINT", () => {
  log("INFO", "MCP Server shutting down (SIGINT)");
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("INFO", "MCP Server shutting down (SIGTERM)");
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  log("ERROR", "Uncaught exception — server will exit", {
    message: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log("ERROR", "Unhandled promise rejection", { reason: String(reason) });
  process.exit(1);
});

// =============================================================================
// Entry Point — Connect to stdio transport and start listening
// =============================================================================

async function main(): Promise<void> {
  // StdioServerTransport binds to process.stdin / process.stdout.
  // After this point, NOTHING must write to stdout except the MCP SDK itself.
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Use stderr for startup confirmation — stdout is now owned by MCP SDK
  log("INFO", "✅ Copado Nexus MCP Server connected via stdio transport");
  log("INFO", "📡 Listening for JSON-RPC requests from Claude Desktop / Google Antigravity");
  log("INFO", `🔧 CLI resolver: ${getCliCommand()}`);
  log("INFO", `📄 Diagnostic log: ${LOG_FILE}`);
}

main().catch((err: Error) => {
  log("ERROR", "Fatal: MCP Server failed to start", {
    message: err.message,
    stack: err.stack,
  });
  process.exit(1);
});