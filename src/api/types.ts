export interface AuthResponse {
  success: boolean;
  token: string;
  user: string;
}

export interface TestExecutionResponse {
  success: boolean;
  executionId: string;
  status: string;
  estimatedDuration: string;
}

export interface DeployResponse {
  success: boolean;
  deploymentId: string;
  environment: string;
  status: string;
}

export interface AgentResponse {
  success: boolean;
  agent: string;
  response: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}