#!/usr/bin/env node

import { Command, InvalidArgumentError } from "commander";

import { scaffoldServiceProject } from "./scaffold.js";

function parsePort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Port must be a positive integer.");
  }

  return parsed;
}

const program = new Command();

program
  .name("agent-service-sdk")
  .description("Toolkit for exposing one service to multiple agent-facing surfaces.")
  .showHelpAfterError();

program
  .command("init")
  .description("Scaffold a new service repo using the single-runtime integration pattern.")
  .requiredOption("--dir <path>", "Target directory for the new project")
  .requiredOption("--service-id <id>", "Stable service id, for example warehouse-insights")
  .option("--name <name>", "Human-readable service name")
  .option("--description <text>", "Short service description")
  .option("--template <template>", "Starter template: basic or bearer", "basic")
  .option("--port <number>", "Default development port", parsePort, 4010)
  .option("--sdk-dependency <spec>", "Dependency spec to write into package.json", "^0.1.0")
  .action(async (options) => {
    if (options.template !== "basic" && options.template !== "bearer") {
      throw new InvalidArgumentError("Template must be one of: basic, bearer.");
    }

    const project = await scaffoldServiceProject({
      targetDir: options.dir,
      serviceId: options.serviceId,
      serviceName: options.name,
      description: options.description,
      port: options.port,
      sdkDependency: options.sdkDependency,
      template: options.template,
    });

    console.log(`Created ${project.serviceName} in ${project.targetDir}`);
    console.log("Next steps:");
    console.log(`  cd ${project.targetDir}`);
    console.log("  pnpm install");
    console.log("  pnpm dev");
    console.log(`  pnpm cli setup --origin http://127.0.0.1:${project.port}`);
  });

await program.parseAsync(process.argv);
