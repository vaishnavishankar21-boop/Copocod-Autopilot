import {
  AuthResponse,
  TestExecutionResponse,
  DeployResponse,
  AgentResponse
} from "./types.js";

import { simulateNetwork } from "./mockGateway.js";

export async function login(): Promise<AuthResponse> {

  return simulateNetwork({
    success: true,
    token: "mock-token-123",
    user: "developer@copado.com"
  });

}

export async function runTest(
  jobId: string
): Promise<TestExecutionResponse | any> {

  if (jobId === "fail-suite") {

    return simulateNetwork({
      success: false,
      error: {
        code: "TEST_FAILURE",
        message: "Regression suite failed"
      }
    });

  }

  return simulateNetwork({
    success: true,
    executionId: `EXEC-${Date.now()}`,
    status: "RUNNING",
    estimatedDuration: "4m"
  });

}

export async function deploy(
  env: string
): Promise<DeployResponse> {

  return simulateNetwork({
    success: true,
    deploymentId: `DEPLOY-${Date.now()}`,
    environment: env,
    status: "QUEUED"
  });

}

const agentResponses: Record<string, string> = {
  plan: "Deployment risk is LOW",
  build: "Metadata dependencies detected",
  test: "Coverage threshold is 82%",
  release: "Ready for UAT validation",
  operate: "Monitoring enabled successfully"
};

export async function askAgent(
  agent: string,
  prompt: string
): Promise<AgentResponse> {

  return simulateNetwork({
    success: true,
    agent,
    response:
      agentResponses[agent] ||
      `Processed prompt: ${prompt}`
  });

}