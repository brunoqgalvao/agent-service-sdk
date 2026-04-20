import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { Command, InvalidArgumentError } from "commander";

import { describeOperations, getBinaryName } from "../service.js";
import { getObjectShape, isBooleanLikeSchema, queryFromParsedInput } from "../lib/schema.js";
import type { AgentServiceDefinition, CliCredentials } from "../types.js";

function credentialsDir(serviceId: string): string {
  return join(homedir(), ".agent-service", serviceId);
}

function credentialsPath(serviceId: string): string {
  return join(credentialsDir(serviceId), "credentials.json");
}

function loadCredentials(serviceId: string): CliCredentials | null {
  const file = credentialsPath(serviceId);
  if (!existsSync(file)) {
    return null;
  }

  return JSON.parse(readFileSync(file, "utf-8")) as CliCredentials;
}

function saveCredentials(serviceId: string, credentials: CliCredentials): void {
  const dir = credentialsDir(serviceId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(credentialsPath(serviceId), JSON.stringify(credentials, null, 2));
}

async function requestJson(
  method: string,
  url: string,
  options: { token?: string; body?: unknown },
) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed (${response.status}): ${body}`);
  }

  return response.json();
}

function parseJsonPayload(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new InvalidArgumentError("Payload must be valid JSON.");
  }
}

function optionLabel(key: string): string {
  return key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function optionValueDescription(key: string): string {
  return key;
}

function buildOperationInput(
  declaredKeys: string[],
  options: Record<string, unknown>,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};

  for (const key of declaredKeys) {
    if (options[key] !== undefined) {
      input[key] = options[key];
    }
  }

  return input;
}

function renderSetupHelp<TServiceContext>(service: AgentServiceDefinition<TServiceContext>): string | null {
  if (service.auth?.kind !== "bearer") {
    return null;
  }

  const helpLines = [
    "",
    ...(service.auth.description ? [`Authentication: ${service.auth.description}`] : []),
    ...(service.auth.cliSetup?.instructions ? [service.auth.cliSetup.instructions] : []),
  ];

  const profiles = service.auth.cliSetup?.profiles ?? [];
  if (profiles.length > 0) {
    helpLines.push("", "Profiles:");
    for (const profile of profiles) {
      helpLines.push(`  - ${profile.id}: ${profile.label}${profile.description ? ` - ${profile.description}` : ""}`);
    }
  }

  return helpLines.join("\n");
}

export function createServiceCli<TServiceContext>(
  service: AgentServiceDefinition<TServiceContext>,
) {
  const program = new Command();
  const binaryName = getBinaryName(service);
  const operations = describeOperations(service);

  program
    .name(binaryName)
    .description(`${service.name} CLI`)
    .showHelpAfterError();

  const setupCommand = program
    .command("setup")
    .description(service.cli?.setupDescription ?? "Store origin and optional local authentication details.")
    .requiredOption("--origin <url>", "Service origin, for example http://localhost:4010");

  if (service.auth?.kind === "bearer") {
    setupCommand
      .option("--token <value>", "Bearer token when the service requires authentication")
      .option("--profile <id>", "Named profile defined by the service");
  }

  const setupHelp = renderSetupHelp(service);
  if (setupHelp) {
    setupCommand.addHelpText("after", setupHelp);
  }

  setupCommand
    .action((options) => {
      const profile = service.auth?.kind === "bearer"
        ? service.auth.cliSetup?.profiles?.find((candidate) => candidate.id === options.profile)
        : undefined;

      const token = options.token ?? profile?.token;

      if (service.auth?.kind === "bearer" && !token) {
        throw new Error("This service requires a token or known profile. Pass --token or --profile.");
      }

      saveCredentials(service.id, {
        origin: options.origin,
        token,
        profileId: profile?.id,
        updatedAt: new Date().toISOString(),
      });

      console.log(`${service.name} configured for ${options.origin}`);
      if (profile) {
        console.log(`Profile: ${profile.label}`);
      }
    });

  program
    .command("status")
    .description("Check service connectivity and verify authentication.")
    .option("--json", "Print JSON output")
    .action(async (options) => {
      const credentials = loadCredentials(service.id);

      if (!credentials) {
        throw new Error(`No credentials found. Run: ${binaryName} setup --origin <url>`);
      }

      const result = await requestJson("GET", `${credentials.origin}/v1/status`, {
        token: credentials.token,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(`${service.name} is reachable at ${credentials.origin}`);
      console.log(JSON.stringify(result, null, 2));
    });

  for (const operation of operations) {
    const operationCommand = program
      .command(operation.cli.command)
      .description(operation.cli.description)
      .option("--payload <json>", "Raw JSON payload for complex inputs", parseJsonPayload)
      .option("--json", "Print JSON output");

    const shape = getObjectShape(operation.input) ?? {};
    const declaredKeys = Object.keys(shape);

    for (const [key, schema] of Object.entries(shape)) {
      const flag = optionLabel(key);
      const description = schema.description ?? `Value for ${key}`;

      if (isBooleanLikeSchema(schema)) {
        operationCommand.option(`--${flag}`, description);
        continue;
      }

      operationCommand.option(`--${flag} <${optionValueDescription(key)}>`, description);
    }

    operationCommand.action(async (options) => {
        const credentials = loadCredentials(service.id);

        if (!credentials) {
          throw new Error(`No credentials found. Run: ${binaryName} setup --origin <url>`);
        }

        const parsedFlags = options.payload !== undefined
          ? options.payload
          : buildOperationInput(declaredKeys, options as Record<string, unknown>);

        const input = operation.input.parse(parsedFlags);
        const requestUrl = new URL(operation.rest.path, credentials.origin);

        const result = operation.rest.method === "GET"
          ? await requestJson(
              "GET",
              `${requestUrl.toString()}?${queryFromParsedInput(input as Record<string, unknown>).toString()}`,
              { token: credentials.token },
            )
          : await requestJson(operation.rest.method, requestUrl.toString(), {
              token: credentials.token,
              body: input,
            });

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(JSON.stringify(result, null, 2));
      });
  }

  return {
    async run(argv = process.argv) {
      await program.parseAsync(argv);
    },
  };
}
