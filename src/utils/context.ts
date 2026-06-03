import fs from "fs";
import path from "path";

export interface CopadoContext {
  userStoryId: string | null;
  pipelineId: string | null;
  lastJobExecutionId: string | null;
  jobStatuses?: Record<string, { status: string; pollCount: number }>;
  testStatuses?: Record<string, { status: string; pollCount: number }>;
}

const CONTEXT_FILE = process.env.COPADO_CONTEXT_FILE
  ? path.resolve(process.cwd(), process.env.COPADO_CONTEXT_FILE)
  : path.join(process.cwd(), ".copado-context.json");

const DEFAULT_CONTEXT: CopadoContext = {
  userStoryId: null,
  pipelineId: null,
  lastJobExecutionId: null,
  jobStatuses: {},
  testStatuses: {},
};

export function getContext(): CopadoContext {
  try {
    if (!fs.existsSync(CONTEXT_FILE)) {
      fs.writeFileSync(
        CONTEXT_FILE,
        JSON.stringify(DEFAULT_CONTEXT, null, 2)
      );
      return DEFAULT_CONTEXT;
    }

    const data = fs.readFileSync(CONTEXT_FILE, "utf8");
    return JSON.parse(data);
  } catch {
    return DEFAULT_CONTEXT;
  }
}

export function setContext(
  update: Partial<CopadoContext>
): CopadoContext {
  const current = getContext();

  const updated = {
    ...current,
    ...update,
  };

  fs.writeFileSync(
    CONTEXT_FILE,
    JSON.stringify(updated, null, 2)
  );

  return updated;
}