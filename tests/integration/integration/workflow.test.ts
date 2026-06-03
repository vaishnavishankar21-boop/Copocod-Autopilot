import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const CLI_PATH = path.resolve(process.cwd(), "src", "cli", "index.ts");
const CONTEXT_PATH = path.resolve(process.cwd(), `.copado-context-test-${process.pid}.json`);

function runCliCommand(args: string, env: Record<string, string> = {}): { stdout: string; status: number } {
  try {
    const stdout = execSync(`npx tsx "${CLI_PATH}" ${args}`, {
      encoding: "utf-8",
      env: {
        ...process.env,
        COPADO_CONTEXT_FILE: path.basename(CONTEXT_PATH),
        ...env,
      },
    });
    return { stdout: stdout.trim(), status: 0 };
  } catch (err: any) {
    const errOutput = err.stdout?.toString().trim() || "";
    const errError = err.stderr?.toString().trim() || "";
    console.error(`CLI Command failed: ${args}\nExit Code: ${err.status}\nStdout: ${errOutput}\nStderr: ${errError}`);
    return {
      stdout: errOutput || err.message,
      status: err.status ?? 1,
    };
  }
}

describe("Copado Nexus Workflow Integration", () => {
  beforeAll(() => {
    // Clean up context file before starting tests
    if (fs.existsSync(CONTEXT_PATH)) {
      fs.unlinkSync(CONTEXT_PATH);
    }
  });

  afterAll(() => {
    // Clean up context file after tests finish
    if (fs.existsSync(CONTEXT_PATH)) {
      fs.unlinkSync(CONTEXT_PATH);
    }
  });

  it("should start with clean auth and login successfully", () => {
    // Run login
    const loginResult = runCliCommand("auth login --token mock-token --json");
    expect(loginResult.status).toBe(0);
    const loginData = JSON.parse(loginResult.stdout);
    expect(loginData.token).toBe("mock-token");

    // Run status check
    const statusResult = runCliCommand("auth status --json");
    expect(statusResult.status).toBe(0);
    const statusData = JSON.parse(statusResult.stdout);
    expect(statusData.authenticated).toBe(true);
  });

  it("should set a story context", () => {
    const result = runCliCommand("story set --id US-1234 --json");
    expect(result.status).toBe(0);

    const context = JSON.parse(result.stdout);
    expect(context.userStoryId).toBe("US-1234");
    expect(context.pipelineId).toBe("PIPE-1234");
  });

  it("should persist context file", () => {
    expect(fs.existsSync(CONTEXT_PATH)).toBe(true);
    const contextContent = JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf-8"));
    expect(contextContent.userStoryId).toBe("US-1234");
  });

  it("should run a test job", () => {
    const result = runCliCommand("test run --job JOB-1001 --json");
    expect(result.status).toBe(0);

    const data = JSON.parse(result.stdout);
    expect(data.executionId).toContain("EXEC-");
    expect(data.status).toBe("In Progress");

    // Verify context updated
    const contextContent = JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf-8"));
    expect(contextContent.lastJobExecutionId).toBe(data.executionId);
  });

  it("should evaluate status transitions over successive calls", () => {
    // 1st status check -> "In Progress"
    const result1 = runCliCommand("status --json");
    expect(result1.status).toBe(0);
    const data1 = JSON.parse(result1.stdout);
    expect(data1.status).toBe("In Progress");

    // 2nd status check -> "In Progress" (poll count is now 1)
    const result2 = runCliCommand("status --json");
    expect(result2.status).toBe(0);
    const data2 = JSON.parse(result2.stdout);
    expect(data2.status).toBe("In Progress");

    // 3rd status check -> "Completed Successfully" (poll count is 2)
    const result3 = runCliCommand("status --json");
    expect(result3.status).toBe(0);
    const data3 = JSON.parse(result3.stdout);
    expect(data3.status).toBe("Completed Successfully");
  });

  it("should block autonomous UAT/PROD promotions under CI without confirm flag", () => {
    const result = runCliCommand("promote --env PROD --json", { CI: "true" });
    expect(result.status).toBe(1);

    const data = JSON.parse(result.stdout);
    expect(data.success).toBe(false);
    expect(data.error).toBe("HUMAN_APPROVAL_REQUIRED");
  });

  it("should allow UAT/PROD promotions under CI with --confirm flag", () => {
    const result = runCliCommand("promote --env PROD --confirm --json", { CI: "true" });
    expect(result.status).toBe(0);

    const data = JSON.parse(result.stdout);
    expect(data.jobExecutionId).toContain("JOB-");
    expect(data.status).toBe("In Progress");

    // Verify context updated
    const contextContent = JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf-8"));
    expect(contextContent.lastJobExecutionId).toBe(data.jobExecutionId);
  });

  it("should successfully execute the complete CopadoCon Demo Workflow", () => {
    // 1. Set context to story US-2026
    const setStoryRes = runCliCommand("story set --id US-2026 --json");
    expect(setStoryRes.status).toBe(0);
    const storyContext = JSON.parse(setStoryRes.stdout);
    expect(storyContext.userStoryId).toBe("US-2026");

    // 2. Ask Build Agent what changed
    const buildRes = runCliCommand("ai ask --agent build \"What metadata files changed?\" --json");
    expect(buildRes.status).toBe(0);
    const buildData = JSON.parse(buildRes.stdout);
    expect(buildData.response).toContain("LeadScoring.cls");

    // 3. Ask Test Agent to generate CRT script
    const testGenRes = runCliCommand("ai ask --agent test \"Generate a CRT script for LeadScoring.cls\" --json");
    expect(testGenRes.status).toBe(0);
    const testGenData = JSON.parse(testGenRes.stdout);
    expect(testGenData.response).toContain("JOB-SMOKE-2026");

    // 4. Run the Robotic test job
    const runTestRes = runCliCommand("test run --job JOB-SMOKE-2026 --json");
    expect(runTestRes.status).toBe(0);
    const runTestData = JSON.parse(runTestRes.stdout);
    expect(runTestData.executionId).toBe("EXEC-2026");
    expect(runTestData.status).toBe("In Progress");

    // Verify lastJobExecutionId is EXEC-2026
    const ctx1 = JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf-8"));
    expect(ctx1.lastJobExecutionId).toBe("EXEC-2026");

    // 5. Poll status (simulating watch loop/sequential status checks)
    const status1 = runCliCommand("status --json");
    expect(status1.status).toBe(0);
    expect(JSON.parse(status1.stdout).status).toBe("In Progress");

    const status2 = runCliCommand("status --json");
    expect(status2.status).toBe(0);
    expect(JSON.parse(status2.stdout).status).toBe("In Progress");

    const status3 = runCliCommand("status --json");
    expect(status3.status).toBe(0);
    expect(JSON.parse(status3.stdout).status).toBe("Completed Successfully");

    // 6. Push UAT validation promotion under CI (should succeed with confirm)
    const promoteRes = runCliCommand("promote --env UAT --confirm --json", { CI: "true" });
    expect(promoteRes.status).toBe(0);
    const promoteData = JSON.parse(promoteRes.stdout);
    expect(promoteData.jobExecutionId).toBe("JOB-2026");
    expect(promoteData.status).toBe("In Progress");

    // Verify context matches
    const finalContext = JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf-8"));
    expect(finalContext.userStoryId).toBe("US-2026");
    expect(finalContext.lastJobExecutionId).toBe("JOB-2026");
  });

  it("should successfully execute new Track B commands and options", () => {
    // 1. Check story list
    const storyListRes = runCliCommand("story list --json");
    expect(storyListRes.status).toBe(0);
    const stories = JSON.parse(storyListRes.stdout);
    expect(stories.length).toBeGreaterThan(0);
    expect(stories[0].id).toBe("US-2026");

    // 2. Commit with --us flag (sets context and runs commit)
    const commitRes = runCliCommand("commit --us US-7890 --message \"feat: dynamic story commit\" --json");
    expect(commitRes.status).toBe(0);
    const commitData = JSON.parse(commitRes.stdout);
    expect(commitData.commitId).toContain("COMMIT-");

    // Verify context updated
    const ctxAfterCommit = JSON.parse(fs.readFileSync(CONTEXT_PATH, "utf-8"));
    expect(ctxAfterCommit.userStoryId).toBe("US-7890");

    // 3. Check status --job flag
    const statusJobRes = runCliCommand("status --job JOB-CUSTOM-100 --json");
    expect(statusJobRes.status).toBe(0);
    const statusJobData = JSON.parse(statusJobRes.stdout);
    expect(statusJobData.jobExecutionId).toBe("JOB-CUSTOM-100");
    expect(statusJobData.status).toBe("In Progress");

    // 4. Check test list
    const testListRes = runCliCommand("test list --json");
    expect(testListRes.status).toBe(0);
    const suites = JSON.parse(testListRes.stdout);
    expect(suites.length).toBeGreaterThan(0);
    expect(suites[0].jobId).toBe("JOB-SMOKE-2026");

    // 5. Run test with --suite flag
    const runTestSuiteRes = runCliCommand("test run --suite JOB-SMOKE-2026 --json");
    expect(runTestSuiteRes.status).toBe(0);
    const testSuiteData = JSON.parse(runTestSuiteRes.stdout);
    expect(testSuiteData.executionId).toBe("EXEC-2026");
    expect(testSuiteData.projectId).toBe("PRJ-2026");
    expect(testSuiteData.jobId).toBe("JOB-SMOKE-2026");

    // 6. Check test status (progressive polling check)
    // 1st check -> In Progress
    const testStatus1 = runCliCommand("test status --execution EXEC-2026 --json");
    expect(testStatus1.status).toBe(0);
    expect(JSON.parse(testStatus1.stdout).status).toBe("In Progress");

    // 2nd check -> In Progress
    const testStatus2 = runCliCommand("test status --execution EXEC-2026 --json");
    expect(testStatus2.status).toBe(0);
    expect(JSON.parse(testStatus2.stdout).status).toBe("In Progress");

    // 3rd check -> Succeeded
    const testStatus3 = runCliCommand("test status --execution EXEC-2026 --json");
    expect(testStatus3.status).toBe(0);
    expect(JSON.parse(testStatus3.stdout).status).toBe("Succeeded");

    // 7. Check test results
    const testResultsRes = runCliCommand("test results --execution EXEC-2026 --json");
    expect(testResultsRes.status).toBe(0);
    const testResultsData = JSON.parse(testResultsRes.stdout);
    expect(testResultsData.executionId).toBe("EXEC-2026");
    expect(testResultsData.testResult).toBe("Succeeded");
  });
}, 60000);