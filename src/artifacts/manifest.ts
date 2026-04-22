import type { AgentServiceDefinition, OperationDescriptor } from "../types.js";
import { describeOperations, getBasePath, getBinaryName } from "../service.js";
import { schemaToJsonSchema } from "../lib/schema.js";
import { buildOpenApiSpec } from "../adapters/openapi.js";
import { renderLlmsTxt } from "./llms.js";
import { renderSkill } from "./skill.js";

export type AgentServiceManifestOptions = {
  origin: string;
  installCommand?: string;
  stdioCommand?: string;
};

function buildAuthManifest<TServiceContext>(service: AgentServiceDefinition<TServiceContext>) {
  if (!service.auth || service.auth.kind === "none") {
    return {
      kind: "none",
      required: false,
      instructions: "No authentication required.",
    };
  }

  return {
    kind: "bearer",
    required: true,
    description: service.auth.description ?? "This service requires bearer authentication.",
    instructions: service.auth.cliSetup?.instructions ?? "Provide a bearer token when configuring the service.",
    profiles: service.auth.cliSetup?.profiles?.map((profile) => ({
      id: profile.id,
      label: profile.label,
      description: profile.description,
    })) ?? [],
  };
}

function buildOperationManifest<TServiceContext>(
  service: AgentServiceDefinition<TServiceContext>,
  operation: OperationDescriptor<TServiceContext>,
) {
  return {
    key: operation.key,
    title: operation.title,
    description: operation.description,
    scopes: operation.scopes,
    inputSchema: schemaToJsonSchema(operation.input, `${service.id}_${operation.slug}_input`),
    outputSchema: operation.output
      ? schemaToJsonSchema(operation.output, `${service.id}_${operation.slug}_output`)
      : null,
    interfaces: {
      rest: {
        method: operation.rest.method,
        path: operation.rest.path,
      },
      mcp: {
        toolName: operation.mcp.toolName,
      },
      cli: {
        command: operation.cli.command,
      },
    },
  };
}

export function buildAgentServiceManifest<TServiceContext>(
  service: AgentServiceDefinition<TServiceContext>,
  options: AgentServiceManifestOptions,
) {
  const binaryName = getBinaryName(service);
  const basePath = getBasePath(service);
  const operations = describeOperations(service);
  const installCommand = options.installCommand ?? `${binaryName} setup --origin ${options.origin}`;
  const skillMarkdown = renderSkill(service, options);
  const llmsTxt = renderLlmsTxt(service, options);
  const openapi = buildOpenApiSpec(service, { origin: options.origin });

  return {
    manifestVersion: "agent-service-sdk/v1",
    kind: "agent-service",
    instruction: "This single document is the setup and usage entrypoint for agents. Do not ask the human to choose MCP, OpenAPI, REST, CLI, or skill setup. Read this manifest, choose the best interface your host supports, authenticate if required, and start using the operations.",
    humanPrompt: `See ${options.origin}, set it up, and start using it.`,
    service: {
      id: service.id,
      name: service.name,
      version: service.version,
      description: service.description,
    },
    auth: buildAuthManifest(service),
    operations: operations.map((operation) => buildOperationManifest(service, operation)),
    interfaces: {
      preferredOrder: ["mcp-http", "openapi", "rest", "cli", "mcp-stdio"],
      mcpHttp: {
        url: `${options.origin}/mcp`,
        transport: "streamable-http",
        tools: operations.map((operation) => operation.mcp.toolName),
      },
      openapi: {
        url: `${options.origin}/v1/openapi.json`,
        spec: openapi,
      },
      rest: {
        baseUrl: `${options.origin}${basePath}`,
        operations: operations.map((operation) => ({
          key: operation.key,
          method: operation.rest.method,
          path: operation.rest.path,
        })),
      },
      cli: {
        binaryName,
        setupCommand: installCommand,
      },
      ...(options.stdioCommand
        ? {
            mcpStdio: {
              command: options.stdioCommand,
            },
          }
        : {}),
    },
    artifacts: {
      skillMarkdown,
      llmsTxt,
    },
  };
}
