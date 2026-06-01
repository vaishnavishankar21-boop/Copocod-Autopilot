#!/usr/bin/env node

import { Command } from "commander";
import { getContext, setContext } from "../utils/context";
import { saveToken, getToken } from "../utils/keychain";

const program = new Command();

program
  .name("copado-hx")
  .description("Copado AutoPilot CLI")
  .version("1.0.0");

function output(data: any, json?: boolean) {
  if (json) {
    console.log(
      JSON.stringify(
        {
          success: true,
          data,
        },
        null,
        2
      )
    );
  } else {
    console.log(data);
  }
}

program
  .command("auth-login")
  .option("--token <token>")
  .option("--json")
  .action(async (options) => {
    await saveToken(options.token || "mock-token");

    output(
      {
        message: "Token stored successfully",
      },
      options.json
    );
  });

program
  .command("auth-status")
  .option("--json")
  .action(async (options) => {
    const token = await getToken();

    output(
      {
        authenticated: !!token,
      },
      options.json
    );
  });

program
  .command("story-set")
  .requiredOption("--id <id>")
  .option("--json")
  .action((options) => {
    const context = setContext({
      userStoryId: options.id,
    });

    output(context, options.json);
  });

program
  .command("story-show")
  .option("--json")
  .action((options) => {
    output(getContext(), options.json);
  });

program
  .command("status")
  .option("--json")
  .action((options) => {
    const context = getContext();

    output(
      {
        lastJobExecutionId:
          context.lastJobExecutionId,
      },
      options.json
    );
  });

program.parse();