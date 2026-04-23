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

function resolveCredentialAcquisition<TServiceContext>(
  service: AgentServiceDefinition<TServiceContext>,
  origin: string,
) {
  if (service.auth?.kind !== "bearer") {
    return null;
  }

  const raw = service.auth.credentialAcquisition ?? {
    type: "user-provided",
    instructions: "Ask the human for a bearer token or read it from the host secret store before calling protected interfaces.",
  };
  const tokenUrl = raw.tokenUrl
    ? raw.tokenUrl.startsWith("/") ? `${origin}${raw.tokenUrl}` : raw.tokenUrl
    : raw.type === "demo" && raw.profiles?.some((profile) => profile.token)
      ? `${origin}/auth/demo-token`
      : undefined;

  return {
    ...raw,
    ...(tokenUrl ? { tokenUrl } : {}),
    profiles: raw.profiles?.map((profile) => ({
      id: profile.id,
      label: profile.label,
      description: profile.description,
    })),
  };
}

function buildAuthManifest<TServiceContext>(
  service: AgentServiceDefinition<TServiceContext>,
  origin: string,
) {
  if (!service.auth || service.auth.kind === "none") {
    return {
      kind: "none",
      required: false,
      instructions: "No authentication required.",
      httpHeader: null,
      credentialAcquisition: null,
    };
  }

  return {
    kind: "bearer",
    required: true,
    description: service.auth.description ?? "This service requires bearer authentication.",
    instructions: service.auth.cliSetup?.instructions ?? "Provide a bearer token when configuring the service.",
    httpHeader: {
      name: "Authorization",
      valueFormat: "Bearer <token>",
      appliesTo: ["rest", "openapi", "mcp-http"],
    },
    credentialAcquisition: resolveCredentialAcquisition(service, origin),
    profiles: service.auth.cliSetup?.profiles?.map((profile) => ({
      id: profile.id,
      label: profile.label,
      description: profile.description,
    })) ?? [],
  };
}

function buildQuickstart<TServiceContext>(
  service: AgentServiceDefinition<TServiceContext>,
  options: AgentServiceManifestOptions,
  operations: Array<OperationDescriptor<TServiceContext>>,
) {
  const bearerAuth = service.auth?.kind === "bearer" ? service.auth : null;
  const authRequired = Boolean(bearerAuth);
  const credentialAcquisition = resolveCredentialAcquisition(service, options.origin);
  const firstReadOperation = operations.find((operation) => operation.rest.method === "GET") ?? operations[0];
  const firstOperation = firstReadOperation ?? operations[0];
  const firstWriteOperation = operations.find((operation) => operation.rest.method !== "GET");

  return {
    steps: [
      `Fetch ${options.origin} and read this manifest.`,
      "Use interfaces.preferredOrder to choose the best supported integration. Prefer mcp-http when your host supports remote MCP.",
      authRequired
        ? "Get a bearer token from the human, OAuth flow, secret store, or named setup profile before making REST, OpenAPI, or remote MCP calls."
        : "No authentication is required before making REST, OpenAPI, or remote MCP calls.",
      "Use operations[*].interfaces to map each operation to REST paths, MCP tool names, or CLI commands.",
    ],
    auth: authRequired
      ? {
          required: true,
          header: {
            name: "Authorization",
            valueFormat: "Bearer <token>",
            example: "Authorization: Bearer ${AGENT_SERVICE_TOKEN}",
          },
          tokenVariable: "AGENT_SERVICE_TOKEN",
          appliesTo: ["rest", "openapi", "mcp-http"],
          credentialAcquisition,
        }
      : {
          required: false,
        },
    mcpHttp: {
      url: `${options.origin}/mcp`,
      package: "@modelcontextprotocol/sdk",
      transport: "StreamableHTTPClientTransport",
      authHeaderLocation: authRequired ? "requestInit.headers.Authorization" : null,
      connectNotes: authRequired
        ? [
            "Pass the bearer token when constructing StreamableHTTPClientTransport.",
            "Missing or invalid bearer tokens fail during MCP transport connection before tools can be listed.",
          ]
        : [
            "Connect to the MCP URL directly; no auth headers are needed.",
          ],
      typescriptExample: [
        "import { Client } from \"@modelcontextprotocol/sdk/client/index.js\";",
        "import { StreamableHTTPClientTransport } from \"@modelcontextprotocol/sdk/client/streamableHttp.js\";",
        "",
        `const manifest = await fetch("${options.origin}").then((response) => response.json());`,
        authRequired ? "const token = process.env.AGENT_SERVICE_TOKEN;" : "",
        "const transport = new StreamableHTTPClientTransport(new URL(manifest.interfaces.mcpHttp.url), {",
        authRequired ? "  requestInit: { headers: { Authorization: `Bearer ${token}` } }," : "",
        "});",
        "const client = new Client({ name: \"agent-client\", version: \"0.1.0\" });",
        "await client.connect(transport);",
        "const tools = await client.listTools();",
        firstOperation ? `// Call ${firstOperation.mcp.toolName} with arguments that match operations[].inputSchema.` : "",
      ].filter(Boolean).join("\n"),
    },
    rest: {
      baseUrl: `${options.origin}${getBasePath(service)}`,
      authHeaderLocation: authRequired ? "HTTP Authorization header" : null,
      exampleRead: firstReadOperation
        ? {
            operationKey: firstReadOperation.key,
            method: firstReadOperation.rest.method,
            url: `${options.origin}${firstReadOperation.rest.path}`,
            headers: authRequired ? { Authorization: "Bearer ${AGENT_SERVICE_TOKEN}" } : {},
          }
        : null,
    },
    errorHandling: authRequired
      ? [
          {
            condition: "missing_or_invalid_token",
            restStatus: 401,
            mcpHttpBehavior: "The MCP connection request fails before listTools or callTool can run.",
          },
          {
            condition: "missing_required_scope",
            restStatus: 403,
            mcpHttpBehavior: "The MCP tool call returns a tool result with isError: true and an error body.",
            writeOperationExample: firstWriteOperation?.mcp.toolName ?? null,
          },
        ]
      : [],
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
    auth: buildAuthManifest(service, options.origin),
    operations: operations.map((operation) => buildOperationManifest(service, operation)),
    quickstart: buildQuickstart(service, options, operations),
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
