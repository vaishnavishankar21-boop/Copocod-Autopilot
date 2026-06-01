import { simulateNetwork } from "./mockGateway.js";
import { runTest, askAgent, deploy } from "./mockCopado.js";
import { getToken } from "../utils/keychain.js";

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
  // 🔑 API Key Usage: Retrieve the token from OS Keychain
  const token = await getToken();
  if (token && token !== "mock-token-123" && token !== "mock-token") {
    // [REAL API PATH]: Connect to Agentia Pro (CI/CD API) using token
    console.error(`[Copado Nexus] Authenticating Agentia Pro (CI/CD) with token prefix: ${token.substring(0, 4)}...`);
    // Example Network Call:
    // const response = await fetch("https://api.copado.com/v1/commits", {
    //   method: "POST",
    //   headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    //   body: JSON.stringify({ storyId, message })
    // });
    // return await response.json();
  }

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
  // 🔑 API Key Usage: Retrieve the token from OS Keychain
  const token = await getToken();
  if (token && token !== "mock-token-123" && token !== "mock-token") {
    // [REAL API PATH]: Promote User Story in Copado CI/CD (Agentia Pro)
    console.error(`[Copado Nexus] Triggering promotion to ${env} on Agentia Pro using token...`);
    // Example Network Call:
    // const response = await fetch("https://api.copado.com/v1/promotions", {
    //   method: "POST",
    //   headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    //   body: JSON.stringify({ storyId, environment: env, validateOnly })
    // });
    // return await response.json();
  }

  // If storyId matches demo or is UAT
  if (storyId.includes("2026") || env.toUpperCase() === "UAT") {
    return simulateNetwork({
      jobExecutionId: "JOB-2026",
      status: "In Progress",
      environment: env,
      validateOnly: !!validateOnly,
    });
  }

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
  // 🔑 API Key Usage: Retrieve the token from OS Keychain
  const token = await getToken();
  if (token && token !== "mock-token-123" && token !== "mock-token") {
    // [REAL API PATH]: Trigger test suite execution on Agentia Testing (CRT OpenAPI)
    console.error(`[Copado Nexus] Triggering CRT Job ${jobId} on Agentia Testing using token...`);
    // Example Network Call:
    // const response = await fetch(`https://api.copadoflo.com/v1/jobs/${jobId}/execute`, {
    //   method: "POST",
    //   headers: { "Authorization": `Bearer ${token}` }
    // });
    // return await response.json();
  }

  // Demo workflow match
  if (jobId.includes("2026") || jobId.includes("SMOKE")) {
    return simulateNetwork({
      executionId: "EXEC-2026",
      status: "In Progress",
    });
  }

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
  // 🔑 API Key Usage: Retrieve the token from OS Keychain
  const token = await getToken();
  if (token && token !== "mock-token-123" && token !== "mock-token") {
    // [REAL API PATH]: Prompt agent on Agentia AI Context Hub (Copado AI Platform API)
    console.error(`[Copado Nexus] Querying Agentia AI Context Hub agent ${agentId} using token...`);
    // Example Network Call:
    // const response = await fetch("https://api.copado.com/v1/ai/ask", {
    //   method: "POST",
    //   headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    //   body: JSON.stringify({ agent: agentId, prompt })
    // });
    // return await response.json();
  }

  const normPrompt = prompt.toLowerCase();
  
  if (agentId === "build" && (normPrompt.includes("changed") || normPrompt.includes("metadata") || normPrompt.includes("scoring") || normPrompt.includes("apex"))) {
    return simulateNetwork({
      success: true,
      agent: "build",
      response: "The following metadata files have changed in story US-2026: ['LeadScoring.cls']",
    });
  }

  if (agentId === "test" && (normPrompt.includes("leadscoring.cls") || normPrompt.includes("generate") || normPrompt.includes("crt") || normPrompt.includes("script"))) {
    return simulateNetwork({
      success: true,
      agent: "test",
      response: "Successfully generated CRT script for LeadScoring.cls. Job ID: JOB-SMOKE-2026",
    });
  }

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
  // 🔑 API Key Usage: Retrieve the token from OS Keychain
  const token = await getToken();
  if (token && token !== "mock-token-123" && token !== "mock-token") {
    // [REAL API PATH]: Query job status on Agentia Pro/Testing API
    console.error(`[Copado Nexus] Querying job execution status for ${jobExecutionId} using token...`);
    // Example Network Call:
    // const response = await fetch(`https://api.copado.com/v1/jobs/${jobExecutionId}/status`, {
    //   headers: { "Authorization": `Bearer ${token}` }
    // });
    // return await response.json();
  }

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
