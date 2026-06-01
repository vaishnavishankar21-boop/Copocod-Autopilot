#!/usr/bin/env node

import { Command } from "commander";
import * as readline from "readline";
import { getContext, setContext } from "../utils/context.js";
import { saveToken, getToken } from "../utils/keychain.js";
import {
  commitChanges,
  promoteStory,
  runRoboticTest,
  askCopadoAgent,
  getJobStatus,
} from "../api/client.js";

const program = new Command();

program
  .name("copado-hx")
  .description("Copado Nexus CLI")
  .version("1.0.0");

// Helper to prompt user for confirmation
function askConfirmation(promptText: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(promptText, (answer) => {
      rl.close();
      const lower = answer.trim().toLowerCase();
      resolve(lower === "y" || lower === "yes");
    });
  });
}

// Helpers for formatted CLI outputs
function printSuccess(message: string, jsonPayload: any, isJson?: boolean) {
  if (isJson) {
    console.log(JSON.stringify(jsonPayload, null, 2));
  } else {
    console.log(message);
  }
  process.exit(0);
}

function printError(message: string, jsonPayload: any, isJson?: boolean) {
  if (isJson) {
    console.log(
      JSON.stringify(
        {
          success: false,
          ...jsonPayload,
        },
        null,
        2
      )
    );
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
}

// =============================================================================
// AUTH COMMANDS
// =============================================================================

const auth = program.command("auth").description("Authentication commands");

auth
  .command("login")
  .description("Authenticate using a token")
  .option("--token <token>", "Copado API Token")
  .option("--json", "Output response in JSON format")
  .action(async (options) => {
    const token = options.token || "mock-token-123";
    try {
      await saveToken(token);
      printSuccess(
        "Authenticated successfully. Token stored securely.",
        {
          message: "Token stored successfully",
          token,
        },
        options.json
      );
    } catch (err: any) {
      printError(
        `Failed to store token: ${err.message}`,
        { error: "KEYCHAIN_ERROR", message: err.message },
        options.json
      );
    }
  });

auth
  .command("status")
  .description("Check current authentication status")
  .option("--json", "Output response in JSON format")
  .action(async (options) => {
    try {
      const token = await getToken();
      if (token) {
        printSuccess(
          "Authenticated as developer@copado.com",
          { authenticated: true, user: "developer@copado.com" },
          options.json
        );
      } else {
        printSuccess(
          "Not authenticated. Please run 'copado-hx auth login --token <token>'",
          { authenticated: false },
          options.json
        );
      }
    } catch (err: any) {
      printError(
        `Failed to query keychain: ${err.message}`,
        { error: "KEYCHAIN_ERROR", message: err.message },
        options.json
      );
    }
  });

// Support legacy flat command names to ensure 100% compatibility
program
  .command("auth-login")
  .description("Legacy login command")
  .option("--token <token>", "Copado API Token")
  .option("--json", "Output response in JSON format")
  .action(async (options) => {
    const token = options.token || "mock-token-123";
    await saveToken(token);
    printSuccess(
      "Token stored successfully",
      { message: "Token stored successfully" },
      options.json
    );
  });

program
  .command("auth-status")
  .description("Legacy status command")
  .option("--json", "Output response in JSON format")
  .action(async (options) => {
    const token = await getToken();
    printSuccess(
      token ? "Authenticated" : "Not authenticated",
      { authenticated: !!token },
      options.json
    );
  });

// =============================================================================
// STORY COMMANDS
// =============================================================================

const story = program.command("story").description("User Story management");

story
  .command("set")
  .description("Set the active User Story context")
  .requiredOption("--id <id>", "User Story ID (e.g. US-1234)")
  .option("--json", "Output response in JSON format")
  .action((options) => {
    const id = options.id;
    // Validate User Story ID format (alphanumeric, hyphens, and underscores only)
    const validPattern = /^[A-Za-z0-9_-]+$/;
    if (!validPattern.test(id)) {
      printError(
        `Invalid Story ID: '${id}'. Use alphanumeric, hyphens, or underscores only.`,
        {
          error: "INVALID_STORY_ID",
          message: "Story ID contains invalid characters.",
        },
        options.json
      );
    }

    // Generate a simulated pipeline ID
    const numberPart = id.replace(/[^0-9]/g, "");
    const pipelineId = `PIPE-${numberPart || "1001"}`;

    const context = setContext({
      userStoryId: id,
      pipelineId,
    });

    printSuccess(`Active story set to ${id}`, context, options.json);
  });

story
  .command("show")
  .description("Show the current active User Story context")
  .option("--json", "Output response in JSON format")
  .action((options) => {
    const context = getContext();
    printSuccess(
      `Active Story ID: ${context.userStoryId || "None"}\nPipeline ID: ${context.pipelineId || "None"}\nLast Job Execution ID: ${context.lastJobExecutionId || "None"}`,
      context,
      options.json
    );
  });

// Support legacy flat command names
program
  .command("story-set")
  .description("Legacy story set command")
  .requiredOption("--id <id>")
  .option("--json")
  .action((options) => {
    const context = setContext({ userStoryId: options.id });
    printSuccess(`Story set to ${options.id}`, context, options.json);
  });

program
  .command("story-show")
  .description("Legacy story show command")
  .option("--json")
  .action((options) => {
    printSuccess("Current context", getContext(), options.json);
  });

// Story commit subcommand (matches MCP copado_commit)
story
  .command("commit")
  .description("Commit metadata changes for the active User Story")
  .requiredOption("--message <message>", "Commit message")
  .option("--json", "Output response in JSON format")
  .action(async (options) => {
    const context = getContext();
    if (!context.userStoryId) {
      printError(
        "No active User Story context. Please set one first using 'copado-hx story set --id <id>'",
        {
          error: "NO_ACTIVE_STORY",
          message: "No active user story set.",
        },
        options.json
      );
    }

    try {
      const result = await commitChanges(context.userStoryId!, options.message);
      printSuccess(
        `Committed changes for story ${context.userStoryId}. Commit ID: ${result.commitId}`,
        result,
        options.json
      );
    } catch (err: any) {
      printError(
        `Commit failed: ${err.message}`,
        { error: "COMMIT_FAILED", message: err.message },
        options.json
      );
    }
  });

// Top-level commit command (matches SKILL.md)
program
  .command("commit")
  .description("Commit metadata changes for the active User Story")
  .requiredOption("--message <message>", "Commit message")
  .option("--json", "Output response in JSON format")
  .action(async (options) => {
    const context = getContext();
    if (!context.userStoryId) {
      printError(
        "No active User Story context. Please set one first using 'copado-hx story set --id <id>'",
        {
          error: "NO_ACTIVE_STORY",
          message: "No active user story set.",
        },
        options.json
      );
    }

    try {
      const result = await commitChanges(context.userStoryId!, options.message);
      printSuccess(
        `Committed changes for story ${context.userStoryId}. Commit ID: ${result.commitId}`,
        result,
        options.json
      );
    } catch (err: any) {
      printError(
        `Commit failed: ${err.message}`,
        { error: "COMMIT_FAILED", message: err.message },
        options.json
      );
    }
  });

// =============================================================================
// PROMOTE & DEPLOY COMMANDS
// =============================================================================

async function handlePromoteOrDeploy(
  env: string,
  validateOnly: boolean,
  confirmOption: boolean,
  jsonOption: boolean
) {
  const context = getContext();
  if (!context.userStoryId) {
    printError(
      "No active User Story context. Please set one first using 'copado-hx story set --id <id>'",
      {
        error: "NO_ACTIVE_STORY",
        message: "No active user story set.",
      },
      jsonOption
    );
  }

  const targetEnv = env.toUpperCase();
  const actionType = validateOnly ? "promote (validation)" : "deploy";

  // Production and UAT safety guardrails
  if (targetEnv === "UAT" || targetEnv === "PROD") {
    if (process.env.CI === "true") {
      if (!confirmOption) {
        printError(
          `Autonomous ${actionType} to ${targetEnv} is prohibited. A human operator must explicitly confirm this action. Re-run with --confirm.`,
          {
            error: "HUMAN_APPROVAL_REQUIRED",
            message: `🚨 GUARDRAIL: Autonomous ${actionType} to ${targetEnv} is prohibited. A human operator must explicitly confirm this action.`,
          },
          jsonOption
        );
      }
    } else {
      const confirmed = await askConfirmation(
        `Confirm ${actionType} to ${targetEnv}? (y/N): `
      );
      if (!confirmed) {
        printError(
          `${actionType} to ${targetEnv} cancelled by user.`,
          { error: "CANCELLED", message: `Action cancelled by user.` },
          jsonOption
        );
      }
    }
  }

  try {
    const result = await promoteStory(
      context.userStoryId!,
      env,
      validateOnly
    );

    // Save jobExecutionId to context
    setContext({ lastJobExecutionId: result.jobExecutionId });

    printSuccess(
      `Job ${result.jobExecutionId} started successfully for ${actionType} to ${env}.`,
      {
        jobExecutionId: result.jobExecutionId,
        status: result.status,
      },
      jsonOption
    );
  } catch (err: any) {
    printError(
      `Promotion/Deployment failed: ${err.message}`,
      { error: "PROMOTION_FAILED", message: err.message },
      jsonOption
    );
  }
}

// Top-level promote command
program
  .command("promote")
  .description("Promote user story to target environment")
  .requiredOption("--env <env>", "Target environment (e.g. UAT, PROD)")
  .option("--validate", "Perform validation only, do not deploy")
  .option("--confirm", "Confirm promotion to UAT/PROD (CI/CD bypass)")
  .option("--json", "Output response in JSON format")
  .action(async (options) => {
    await handlePromoteOrDeploy(
      options.env,
      !!options.validate,
      !!options.confirm,
      !!options.json
    );
  });

// Top-level deploy command
program
  .command("deploy")
  .description("Deploy user story to target environment")
  .requiredOption("--env <env>", "Target environment (e.g. UAT, PROD)")
  .option("--confirm", "Confirm deployment to UAT/PROD (CI/CD bypass)")
  .option("--json", "Output response in JSON format")
  .action(async (options) => {
    await handlePromoteOrDeploy(
      options.env,
      false,
      !!options.confirm,
      !!options.json
    );
  });

// =============================================================================
// TEST COMMANDS
// =============================================================================

const test = program.command("test").description("Robotic Testing commands");

test
  .command("run")
  .description("Execute a Copado Robotic Testing (CRT) job")
  .requiredOption("--job <jobId>", "CRT Job ID to run (e.g. JOB-SMOKE-001)")
  .option("--json", "Output response in JSON format")
  .action(async (options) => {
    try {
      const result = await runRoboticTest(options.job);
      setContext({ lastJobExecutionId: result.executionId });
      printSuccess(
        `Robotic test execution initiated. Execution ID: ${result.executionId}`,
        result,
        options.json
      );
    } catch (err: any) {
      printError(
        `Test run failed: ${err.message}`,
        { error: "TEST_FAILED", message: err.message },
        options.json
      );
    }
  });

// Support top-level test command (optional, just in case)
program
  .command("test-run")
  .description("Legacy test run command")
  .requiredOption("--job <jobId>")
  .option("--json")
  .action(async (options) => {
    const result = await runRoboticTest(options.job);
    setContext({ lastJobExecutionId: result.executionId });
    printSuccess("Test run started", result, options.json);
  });

// =============================================================================
// AI COMMANDS
// =============================================================================

const ai = program.command("ai").description("Copado AI commands");

ai
  .command("ask")
  .description("Delegate prompt to a Copado AI Agent")
  .requiredOption(
    "--agent <agent>",
    "Agent name (plan, build, test, release, operate)"
  )
  .option("--prompt <prompt>", "The natural language instruction")
  .argument("[promptText]", "Alternative positional prompt")
  .option("--json", "Output response in JSON format")
  .action(async (positionalPrompt, options) => {
    const promptStr = options.prompt || positionalPrompt;
    if (!promptStr) {
      printError(
        "Prompt instruction is required. Provide it via --prompt or as a trailing argument.",
        { error: "MISSING_PROMPT", message: "Prompt is required." },
        options.json
      );
    }

    try {
      const result = await askCopadoAgent(options.agent, promptStr);
      printSuccess(result.response, result, options.json);
    } catch (err: any) {
      printError(
        `AI Agent failed: ${err.message}`,
        { error: "AI_FAILED", message: err.message },
        options.json
      );
    }
  });

// =============================================================================
// STATUS COMMAND
// =============================================================================

async function checkAndUpdateStatus(
  jobExecutionId: string
): Promise<string> {
  const context = getContext();
  const jobStatuses = context.jobStatuses || {};
  const jobState = jobStatuses[jobExecutionId] || {
    status: "In Progress",
    pollCount: 0,
  };

  const apiResult = await getJobStatus(jobExecutionId, jobState.pollCount);

  jobStatuses[jobExecutionId] = {
    status: apiResult.status,
    pollCount: jobState.pollCount + 1,
  };
  setContext({ jobStatuses });

  return apiResult.status;
}

program
  .command("status")
  .description("Get the status of the last tracked execution job")
  .option("--watch", "Poll status continuously until completion")
  .option("--json", "Output response in JSON format")
  .action(async (options) => {
    const context = getContext();
    const executionId = context.lastJobExecutionId;

    if (!executionId) {
      printError(
        "No job execution is currently tracked in context. Run a promotion, deployment, or test first.",
        {
          error: "NO_TRACKED_JOB",
          message: "No job execution tracked in current context.",
        },
        options.json
      );
    }

    if (options.watch) {
      let currentStatus = "In Progress";
      while (currentStatus === "In Progress") {
        currentStatus = await checkAndUpdateStatus(executionId!);
        if (options.json) {
          console.log(
            JSON.stringify(
              { jobExecutionId: executionId, status: currentStatus },
              null,
              2
            )
          );
        } else {
          console.log(`Job ${executionId} status: ${currentStatus}`);
        }

        if (currentStatus === "In Progress") {
          // Wait 2 seconds between polls
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      // Exit 0 on success, exit 1 on failure/errors
      if (currentStatus === "Completed Successfully") {
        process.exit(0);
      } else {
        process.exit(1);
      }
    } else {
      const status = await checkAndUpdateStatus(executionId!);
      if (options.json) {
        console.log(
          JSON.stringify({ jobExecutionId: executionId, status }, null, 2)
        );
      } else {
        console.log(`Job ${executionId} status: ${status}`);
      }

      if (status === "Completed Successfully" || status === "In Progress") {
        process.exit(0);
      } else {
        process.exit(1);
      }
    }
  });

program.parse();