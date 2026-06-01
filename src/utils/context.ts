import fs from "fs";
import path from "path";

export interface CopadoContext {
  userStoryId: string | null;
  pipelineId: string | null;
  lastJobExecutionId: string | null;
}

const CONTEXT_FILE = path.join(process.cwd(), ".copado-context.json");

const DEFAULT_CONTEXT: CopadoContext = {
  userStoryId: null,
  pipelineId: null,
  lastJobExecutionId: null,
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