import { simulateNetwork } from "./mockGateway.js";
import { runTest, askAgent, deploy } from "./mockCopado.js";

export interface CommitResponse {
  commitId: string;
  status: string;
  filesCommitted: string[];
}

export interface PromoteResponse {
  jobExecutionId: string;
  status: string;
  environment: string;
  validateOnly?: boolean;
}

export interface TestRunResponse {
  executionId: string;
  status: string;
}

export interface AskAgentResponse {
  success: boolean;
  agent: string;
  response: string;
}

export interface JobStatusResponse {
  jobExecutionId: string;
  status: string;
}

/**
 * Commits metadata changes for the given user story.
 * Returns a simulated list of modified files.
 */
export async function commitChanges(
  storyId: string,
  message: string
): Promise<CommitResponse> {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return simulateNetwork({
    commitId: `COMMIT-${randomSuffix}`,
    status: "Completed Successfully",
    filesCommitted: ["LeadScoring.cls", "LeadScoringTest.cls"],
  });
}

/**
 * Promotes/Deploys a user story to the specified target environment.
 */
export async function promoteStory(
  storyId: string,
  env: string,
  validateOnly?: boolean
): Promise<PromoteResponse> {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return simulateNetwork({
    jobExecutionId: `JOB-${randomSuffix}`,
    status: "In Progress",
    environment: env,
    validateOnly: !!validateOnly,
  });
}

/**
 * Executes a Copado Robotic Testing (CRT) test suite job.
 */
export async function runRoboticTest(
  jobId: string
): Promise<TestRunResponse> {
  // If jobId is "fail-suite", simulate a failure
  if (jobId === "fail-suite") {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return simulateNetwork({
      executionId: `EXEC-FAIL-${randomSuffix}`,
      status: "Failed",
    });
  }

  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return simulateNetwork({
    executionId: `EXEC-${randomSuffix}`,
    status: "In Progress",
  });
}

/**
 * Queries one of the 5 specialized Copado AI Agents.
 */
export async function askCopadoAgent(
  agentId: string,
  prompt: string
): Promise<AskAgentResponse> {
  const result = await askAgent(agentId, prompt);
  return {
    success: result.success,
    agent: result.agent,
    response: result.response,
  };
}

/**
 * Gets the simulated status of a job execution.
 */
export async function getJobStatus(
  jobExecutionId: string,
  pollCount: number = 0
): Promise<JobStatusResponse> {
  // If the execution ID indicates a failure
  if (jobExecutionId.includes("FAIL")) {
    return simulateNetwork({
      jobExecutionId,
      status: "Failed",
    });
  }

  // Progressive status resolution: "In Progress" for first 2 polls, then success
  if (pollCount < 2) {
    return simulateNetwork({
      jobExecutionId,
      status: "In Progress",
    });
  }

  return simulateNetwork({
    jobExecutionId,
    status: "Completed Successfully",
  });
}
