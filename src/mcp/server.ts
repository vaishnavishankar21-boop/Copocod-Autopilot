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

/**
 * Determines the correct CLI command to invoke.
 * In production (after `npm run build`), uses `node dist/cli/index.js`.
 * Falls back to `npx tsx src/cli/index.ts` for dev mode (tsx hot-run).
 */
function getCliCommand(): string {
  const distPath = path.resolve(process.cwd(), "dist", "cli", "index.js");
  if (fs.existsSync(distPath)) {
    return `node "${distPath}"`;
  }
  // Dev fallback: run TypeScript directly via tsx
  return `npx tsx "${path.resolve(process.cwd(), "src", "cli", "index.ts")}"`;
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
      // Tool 1: copado_story_set
      // Sets the active Salesforce User Story in .copado-context.json
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
      // Tool 2: copado_commit
      // Commits changes for the active User Story
      // -----------------------------------------------------------------------
      {
        name: "copado_commit",
        description:
          "Commits staged Salesforce metadata changes for the currently active " +
          "User Story. Requires a story to be set via copado_story_set first. " +
          "This triggers the Build agent pipeline.",
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
          },
          required: ["message"],
          additionalProperties: false,
        },
      },

      // -----------------------------------------------------------------------
      // Tool 3: copado_test_run
      // Executes a Copado Robotic Testing (CRT) job
      // -----------------------------------------------------------------------
      {
        name: "copado_test_run",
        description:
          "Triggers a Copado Robotic Testing (CRT) job by its Job ID and returns " +
          "the execution ID and status. Use this to validate changes before any " +
          "deployment. IMPORTANT: Do NOT auto-retry failed tests — surface the " +
          "failure to the human operator and await instructions.",
        inputSchema: {
          type: "object",
          properties: {
            jobId: {
              type: "string",
              description:
                "The CRT Job ID to execute (e.g. 'JOB-SMOKE-001'). " +
                "Must reference a real, pre-configured test job.",
              minLength: 1,
              maxLength: 64,
            },
          },
          required: ["jobId"],
          additionalProperties: false,
        },
      },

      // -----------------------------------------------------------------------
      // Tool 4: copado_ai_ask
      // Delegates a prompt to one of the 5 Copado AI Agents
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
    case "copado_commit": {
      const message = args["message"];
      if (typeof message !== "string" || message.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "copado_commit requires a non-empty 'message' string."
        );
      }

      // Wrap message in single quotes and escape any internal single quotes
      const safeMessage = message.replace(/'/g, `'\\''`);
      const result = runCli(`story commit --message '${safeMessage}'`);
      return { content: buildContent(result) };
    }

    // -----------------------------------------------------------------------
    case "copado_test_run": {
      const jobId = args["jobId"];
      if (typeof jobId !== "string" || jobId.trim() === "") {
        throw new McpError(
          ErrorCode.InvalidParams,
          "copado_test_run requires a non-empty 'jobId' string."
        );
      }

      // Sanitize job ID
      const safeJobId = jobId.replace(/[^A-Za-z0-9_\-]/g, "");
      if (safeJobId !== jobId) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Job ID '${jobId}' contains invalid characters.`
        );
      }

      const result = runCli(`test run --job ${safeJobId}`);
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
                    "A human operator must explicitly confirm this action. " +
                    "Please present the deployment plan to the user and await explicit written approval " +
                    "before proceeding. Do NOT retry this request automatically.",
                  suggestedAction:
                    "Present the deployment plan to the human operator and ask: " +
                    "'Please confirm: Do you want me to proceed with this deployment? Reply YES to confirm.'",
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