import {
  scaffoldServiceProject
} from "./chunk-JDZJWCNB.js";

// src/lib/schema.ts
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
function schemaToJsonSchema(schema, _name) {
  const jsonSchema = zodToJsonSchema(schema, {
    $refStrategy: "none",
    target: "openApi3"
  });
  if ("definitions" in jsonSchema) {
    delete jsonSchema.definitions;
  }
  return jsonSchema;
}
function getObjectShape(schema) {
  const unwrapped = unwrapSchema(schema);
  if (unwrapped instanceof z.ZodObject) {
    return unwrapped.shape;
  }
  return null;
}
function unwrapSchema(schema) {
  if (schema instanceof z.ZodObject) {
    return schema;
  }
  if (schema instanceof z.ZodEffects) {
    return unwrapSchema(schema.innerType());
  }
  if (schema instanceof z.ZodDefault) {
    return unwrapSchema(schema.removeDefault());
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return unwrapSchema(schema.unwrap());
  }
  return schema;
}
function isBooleanLikeSchema(schema) {
  return unwrapSchema(schema) instanceof z.ZodBoolean;
}
function isScalarLikeSchema(schema) {
  const unwrapped = unwrapSchema(schema);
  return unwrapped instanceof z.ZodString || unwrapped instanceof z.ZodNumber || unwrapped instanceof z.ZodBoolean || unwrapped instanceof z.ZodEnum || unwrapped instanceof z.ZodNativeEnum || unwrapped instanceof z.ZodLiteral || unwrapped instanceof z.ZodDate;
}
function defaultHttpMethod(schema) {
  const shape = getObjectShape(schema);
  if (!shape) {
    return "POST";
  }
  const keys = Object.keys(shape);
  if (keys.length === 0) {
    return "GET";
  }
  return keys.every((key) => isScalarLikeSchema(shape[key])) ? "GET" : "POST";
}
function queryFromParsedInput(input) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === void 0 || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, String(item));
      }
      continue;
    }
    params.set(key, String(value));
  }
  return params;
}

// src/lib/slug.ts
function slugify(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function snakeCase(value) {
  return slugify(value).replace(/-/g, "_");
}

// src/service.ts
function defineAgentService(definition) {
  return definition;
}
function getBinaryName(service) {
  return service.cli?.binaryName ?? slugify(service.id);
}
function getBasePath(service) {
  return service.basePath ?? "/api/agent";
}
function describeOperations(service) {
  const basePath = getBasePath(service);
  return Object.entries(service.operations).map(([key, operation]) => {
    const slug = slugify(key);
    const restMethod = operation.surfaces?.rest?.method ?? defaultHttpMethod(operation.input);
    const restPath = operation.surfaces?.rest?.path ?? `${basePath}/${slug}`;
    const cliCommand = operation.surfaces?.cli?.command ?? slug;
    const toolName = operation.surfaces?.mcp?.toolName ?? `${snakeCase(service.id)}_${snakeCase(key)}`;
    return {
      key,
      slug,
      title: operation.title ?? key,
      description: operation.description,
      input: operation.input,
      output: operation.output,
      scopes: operation.scopes ?? [],
      rest: {
        method: restMethod,
        path: restPath,
        openapi: operation.surfaces?.rest?.openapi ?? true
      },
      cli: {
        command: cliCommand,
        description: operation.surfaces?.cli?.description ?? operation.description
      },
      mcp: {
        toolName,
        description: operation.surfaces?.mcp?.description ?? operation.description
      },
      handler: operation.handler
    };
  });
}

// src/adapters/fastify.ts
import { ZodError as ZodError2 } from "zod";

// src/artifacts/llms.ts
function renderLlmsTxt(service, options) {
  const binaryName = getBinaryName(service);
  const operations = describeOperations(service);
  const setupCommand = options.installCommand ?? `${binaryName} setup --origin ${options.origin}`;
  const authProfiles = service.auth?.kind === "bearer" ? service.auth.cliSetup?.profiles ?? [] : [];
  return `# ${service.name}

> ${service.description}

## Agent Setup

- Service manifest: ${options.origin}
- Human instruction: see ${options.origin}, set it up, and start using it.
- Agent instruction: read the manifest, choose the best interface your host supports, authenticate if required, and use the operations listed there.
- CLI binary: ${binaryName}
- CLI setup: ${setupCommand}
${options.stdioCommand ? `- Local stdio command: ${options.stdioCommand}` : ""}

## Authentication

- Mode: ${service.auth?.kind ?? "none"}
${service.auth?.kind === "bearer" ? `- Instructions: ${service.auth.cliSetup?.instructions ?? "Provide a bearer token or use a configured profile."}
- Remote clients must send Authorization: Bearer <token>
${authProfiles.map((profile) => `- Profile ${profile.id}: ${profile.label}${profile.description ? ` (${profile.description})` : ""}`).join("\n")}` : "- No authentication required"}

## Operations

${operations.map((operation) => `- ${operation.key}: ${operation.description} [${operation.rest.method} ${operation.rest.path}] [tool ${operation.mcp.toolName}]${operation.scopes.length > 0 ? ` [scopes: ${operation.scopes.join(", ")}]` : ""}`).join("\n")}
`;
}

// src/artifacts/skill.ts
function renderSkill(service, options) {
  const binaryName = getBinaryName(service);
  const operations = describeOperations(service);
  const installCommand = options.installCommand ?? `${binaryName} setup --origin ${options.origin}`;
  const commandTable = operations.map((operation) => `| \`${binaryName} ${operation.cli.command}\` | ${operation.cli.description} |`).join("\n");
  const toolList = operations.map((operation) => `- \`${operation.mcp.toolName}\` \u2014 ${operation.mcp.description}`).join("\n");
  const authProfiles = service.auth?.kind === "bearer" ? service.auth.cliSetup?.profiles ?? [] : [];
  const authSection = service.auth?.kind === "bearer" ? `## Authentication

${service.auth.description ?? "This service requires bearer authentication."}

${service.auth.cliSetup?.instructions ?? "Provide a bearer token directly or use one of the named setup profiles."}

${authProfiles.length === 0 ? "" : `### Profiles

${authProfiles.map((profile) => `- \`${profile.id}\` \u2014 ${profile.label}${profile.description ? ` (${profile.description})` : ""}`).join("\n")}
`}
- REST / OpenAPI / Remote MCP requests must send \`Authorization: Bearer <token>\`.
` : "";
  return `---
name: ${service.id}
description: Access ${service.name}. ${service.description}
---

# ${service.name}

${service.description}

## For Agents With Terminal Access

1. Install or open the local adapter for \`${service.name}\`.
2. Run the setup command shown below; authenticated services may require \`--profile\` or \`--token\`.
3. Use JSON output when another model will consume the result.
${options.stdioCommand ? "4. If your host supports stdio MCP, you can also launch the local MCP adapter with the command below." : ""}

\`\`\`bash
${installCommand}
\`\`\`

${options.stdioCommand ? `\`\`\`bash
${options.stdioCommand}
\`\`\`
` : ""}

| Command | Description |
|---------|-------------|
| \`${binaryName} setup\` | Store service origin${service.auth?.kind === "bearer" ? " and authentication token/profile" : ""} |
| \`${binaryName} status\` | Check service connectivity |
${commandTable}

${authSection}
## For Agents Without Terminal Access

- Service manifest: \`${options.origin}\`
- Read the manifest, choose the best interface your host supports, authenticate if required, and use the operations listed there.

## MCP Tools

${toolList}
`;
}

// src/adapters/openapi.ts
var errorResponseSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
    details: {}
  },
  required: ["error", "message"],
  additionalProperties: true
};
function errorResponse(description) {
  return {
    description,
    content: {
      "application/json": {
        schema: errorResponseSchema
      }
    }
  };
}
function buildOpenApiSpec(service, options) {
  const operations = describeOperations(service);
  const paths = {};
  for (const operation of operations) {
    if (!operation.rest.openapi) {
      continue;
    }
    const method = operation.rest.method.toLowerCase();
    const responses = {
      200: {
        description: "Successful response",
        ...operation.output ? {
          content: {
            "application/json": {
              schema: schemaToJsonSchema(operation.output, `${service.id}_${operation.slug}_response`)
            }
          }
        } : {}
      },
      400: errorResponse("Invalid request payload or query string."),
      500: errorResponse("Internal server error or invalid service output.")
    };
    if (service.auth?.kind === "bearer") {
      responses["401"] = errorResponse("Missing or invalid bearer token.");
    }
    if (operation.scopes.length > 0) {
      responses["403"] = errorResponse("Authenticated caller is missing required scopes.");
    }
    const endpoint = {
      summary: operation.title,
      description: operation.description,
      operationId: `${service.id}.${operation.key}`,
      responses
    };
    if (operation.scopes.length > 0) {
      endpoint["x-agent-scopes"] = operation.scopes;
    }
    if (operation.rest.method === "GET") {
      const shape = getObjectShape(operation.input) ?? {};
      endpoint.parameters = Object.entries(shape).map(([key, schema]) => ({
        name: key,
        in: "query",
        required: false,
        schema: schemaToJsonSchema(schema, `${service.id}_${operation.slug}_${key}`)
      }));
    } else {
      endpoint.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: schemaToJsonSchema(operation.input, `${service.id}_${operation.slug}_request`)
          }
        }
      };
    }
    paths[operation.rest.path] = {
      ...paths[operation.rest.path] ?? {},
      [method]: endpoint
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: `${service.name} Agent API`,
      version: service.version,
      description: service.description
    },
    servers: [{ url: options.origin }],
    components: {
      securitySchemes: service.auth?.kind === "bearer" ? {
        bearerAuth: {
          type: "http",
          scheme: "bearer"
        }
      } : {}
    },
    ...service.auth?.kind === "bearer" ? { security: [{ bearerAuth: [] }] } : {},
    paths
  };
}

// src/artifacts/manifest.ts
function buildAuthManifest(service) {
  if (!service.auth || service.auth.kind === "none") {
    return {
      kind: "none",
      required: false,
      instructions: "No authentication required.",
      httpHeader: null,
      credentialAcquisition: null
    };
  }
  const credentialAcquisition = service.auth.credentialAcquisition ?? {
    type: "user-provided",
    instructions: "Ask the human for a bearer token or read it from the host secret store before calling protected interfaces."
  };
  return {
    kind: "bearer",
    required: true,
    description: service.auth.description ?? "This service requires bearer authentication.",
    instructions: service.auth.cliSetup?.instructions ?? "Provide a bearer token when configuring the service.",
    httpHeader: {
      name: "Authorization",
      valueFormat: "Bearer <token>",
      appliesTo: ["rest", "openapi", "mcp-http"]
    },
    credentialAcquisition,
    profiles: service.auth.cliSetup?.profiles?.map((profile) => ({
      id: profile.id,
      label: profile.label,
      description: profile.description
    })) ?? []
  };
}
function buildQuickstart(service, options, operations) {
  const bearerAuth = service.auth?.kind === "bearer" ? service.auth : null;
  const authRequired = Boolean(bearerAuth);
  const credentialAcquisition = bearerAuth ? bearerAuth.credentialAcquisition ?? {
    type: "user-provided",
    instructions: "Ask the human for a bearer token or read it from the host secret store before calling protected interfaces."
  } : null;
  const firstReadOperation = operations.find((operation) => operation.rest.method === "GET") ?? operations[0];
  const firstOperation = firstReadOperation ?? operations[0];
  const firstWriteOperation = operations.find((operation) => operation.rest.method !== "GET");
  return {
    steps: [
      `Fetch ${options.origin} and read this manifest.`,
      "Use interfaces.preferredOrder to choose the best supported integration. Prefer mcp-http when your host supports remote MCP.",
      authRequired ? "Get a bearer token from the human, OAuth flow, secret store, or named setup profile before making REST, OpenAPI, or remote MCP calls." : "No authentication is required before making REST, OpenAPI, or remote MCP calls.",
      "Use operations[*].interfaces to map each operation to REST paths, MCP tool names, or CLI commands."
    ],
    auth: authRequired ? {
      required: true,
      header: {
        name: "Authorization",
        valueFormat: "Bearer <token>",
        example: "Authorization: Bearer ${AGENT_SERVICE_TOKEN}"
      },
      tokenVariable: "AGENT_SERVICE_TOKEN",
      appliesTo: ["rest", "openapi", "mcp-http"],
      credentialAcquisition
    } : {
      required: false
    },
    mcpHttp: {
      url: `${options.origin}/mcp`,
      package: "@modelcontextprotocol/sdk",
      transport: "StreamableHTTPClientTransport",
      authHeaderLocation: authRequired ? "requestInit.headers.Authorization" : null,
      connectNotes: authRequired ? [
        "Pass the bearer token when constructing StreamableHTTPClientTransport.",
        "Missing or invalid bearer tokens fail during MCP transport connection before tools can be listed."
      ] : [
        "Connect to the MCP URL directly; no auth headers are needed."
      ],
      typescriptExample: [
        'import { Client } from "@modelcontextprotocol/sdk/client/index.js";',
        'import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";',
        "",
        `const manifest = await fetch("${options.origin}").then((response) => response.json());`,
        authRequired ? "const token = process.env.AGENT_SERVICE_TOKEN;" : "",
        "const transport = new StreamableHTTPClientTransport(new URL(manifest.interfaces.mcpHttp.url), {",
        authRequired ? "  requestInit: { headers: { Authorization: `Bearer ${token}` } }," : "",
        "});",
        'const client = new Client({ name: "agent-client", version: "0.1.0" });',
        "await client.connect(transport);",
        "const tools = await client.listTools();",
        firstOperation ? `// Call ${firstOperation.mcp.toolName} with arguments that match operations[].inputSchema.` : ""
      ].filter(Boolean).join("\n")
    },
    rest: {
      baseUrl: `${options.origin}${getBasePath(service)}`,
      authHeaderLocation: authRequired ? "HTTP Authorization header" : null,
      exampleRead: firstReadOperation ? {
        operationKey: firstReadOperation.key,
        method: firstReadOperation.rest.method,
        url: `${options.origin}${firstReadOperation.rest.path}`,
        headers: authRequired ? { Authorization: "Bearer ${AGENT_SERVICE_TOKEN}" } : {}
      } : null
    },
    errorHandling: authRequired ? [
      {
        condition: "missing_or_invalid_token",
        restStatus: 401,
        mcpHttpBehavior: "The MCP connection request fails before listTools or callTool can run."
      },
      {
        condition: "missing_required_scope",
        restStatus: 403,
        mcpHttpBehavior: "The MCP tool call returns a tool result with isError: true and an error body.",
        writeOperationExample: firstWriteOperation?.mcp.toolName ?? null
      }
    ] : []
  };
}
function buildOperationManifest(service, operation) {
  return {
    key: operation.key,
    title: operation.title,
    description: operation.description,
    scopes: operation.scopes,
    inputSchema: schemaToJsonSchema(operation.input, `${service.id}_${operation.slug}_input`),
    outputSchema: operation.output ? schemaToJsonSchema(operation.output, `${service.id}_${operation.slug}_output`) : null,
    interfaces: {
      rest: {
        method: operation.rest.method,
        path: operation.rest.path
      },
      mcp: {
        toolName: operation.mcp.toolName
      },
      cli: {
        command: operation.cli.command
      }
    }
  };
}
function buildAgentServiceManifest(service, options) {
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
      description: service.description
    },
    auth: buildAuthManifest(service),
    operations: operations.map((operation) => buildOperationManifest(service, operation)),
    quickstart: buildQuickstart(service, options, operations),
    interfaces: {
      preferredOrder: ["mcp-http", "openapi", "rest", "cli", "mcp-stdio"],
      mcpHttp: {
        url: `${options.origin}/mcp`,
        transport: "streamable-http",
        tools: operations.map((operation) => operation.mcp.toolName)
      },
      openapi: {
        url: `${options.origin}/v1/openapi.json`,
        spec: openapi
      },
      rest: {
        baseUrl: `${options.origin}${basePath}`,
        operations: operations.map((operation) => ({
          key: operation.key,
          method: operation.rest.method,
          path: operation.rest.path
        }))
      },
      cli: {
        binaryName,
        setupCommand: installCommand
      },
      ...options.stdioCommand ? {
        mcpStdio: {
          command: options.stdioCommand
        }
      } : {}
    },
    artifacts: {
      skillMarkdown,
      llmsTxt
    }
  };
}

// src/adapters/mcp.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ZodError } from "zod";

// src/errors.ts
var AgentServiceError = class extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = "AgentServiceError";
  }
  status;
  code;
  details;
};
var UnauthorizedError = class extends AgentServiceError {
  constructor(message = "Unauthorized") {
    super(401, "unauthorized", message);
  }
};
var ForbiddenError = class extends AgentServiceError {
  constructor(message = "Forbidden", details) {
    super(403, "forbidden", message, details);
  }
};
var InvalidRequestError = class extends AgentServiceError {
  constructor(message = "Invalid request", details) {
    super(400, "invalid_request", message, details);
  }
};
var InvalidOutputError = class extends AgentServiceError {
  constructor(message = "Invalid service output", details) {
    super(500, "invalid_output", message, details);
  }
};

// src/lib/runtime.ts
function ensureScopes(operation, auth) {
  if (operation.scopes.length === 0) {
    return;
  }
  const grantedScopes = new Set(auth?.scopes ?? []);
  const missingScopes = operation.scopes.filter((scope) => !grantedScopes.has(scope));
  if (missingScopes.length > 0) {
    throw new ForbiddenError(
      `Missing required scopes: ${missingScopes.join(", ")}`,
      { missingScopes }
    );
  }
}
function validateOutput(schema, result) {
  if (!schema) {
    return result;
  }
  try {
    return schema.parse(result);
  } catch (error) {
    throw new InvalidOutputError("Handler returned data that does not match the declared output schema.", error);
  }
}

// src/adapters/mcp.ts
async function resolveAuth(service, options) {
  const auth = service.auth ?? { kind: "none" };
  if (auth.kind === "none") {
    return null;
  }
  if (!options.token) {
    throw new UnauthorizedError("Missing bearer token.");
  }
  const identity = await auth.verifyToken(options.token, {
    surface: options.surface,
    request: options.request
  });
  if (!identity) {
    throw new UnauthorizedError("Invalid bearer token.");
  }
  return identity;
}
function zodRawShapeFromOperationShape(shape) {
  return shape;
}
function serializeMcpError(error) {
  const normalized = error instanceof AgentServiceError ? error : error instanceof ZodError ? new InvalidRequestError(
    "Request payload does not match the declared input schema.",
    error.issues
  ) : new AgentServiceError(
    500,
    "internal_error",
    error instanceof Error ? error.message : String(error)
  );
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          error: normalized.code,
          status: normalized.status,
          message: normalized.message,
          ...normalized.details === void 0 ? {} : { details: normalized.details }
        }, null, 2)
      }
    ]
  };
}
function createMcpServer(service, options) {
  const server = new McpServer({
    name: service.id,
    version: service.version
  });
  for (const operation of describeOperations(service)) {
    const shape = getObjectShape(operation.input) ?? {};
    const outputShape = operation.output ? getObjectShape(operation.output) : null;
    server.registerTool(
      operation.mcp.toolName,
      {
        title: operation.title,
        description: operation.mcp.description,
        inputSchema: zodRawShapeFromOperationShape(shape),
        ...outputShape ? { outputSchema: zodRawShapeFromOperationShape(outputShape) } : {}
      },
      async (input) => {
        try {
          const requestToken = options.tokenResolver?.();
          const auth = await resolveAuth(service, {
            surface: "mcp",
            token: requestToken
          });
          ensureScopes(operation, auth);
          const serviceContext = await options.createContext();
          const context = {
            surface: "mcp",
            service,
            serviceContext,
            auth
          };
          const parsed = operation.input.parse(input);
          const result = validateOutput(
            operation.output,
            await operation.handler(context, parsed)
          );
          if (typeof result === "object" && result !== null && !Array.isArray(result)) {
            return {
              structuredContent: result,
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
            };
          }
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          };
        } catch (error) {
          return serializeMcpError(error);
        }
      }
    );
  }
  return server;
}
async function startStdioMcpServer(service, options) {
  const server = createMcpServer(service, {
    createContext: options.createContext,
    tokenResolver: () => options.token,
    surface: "mcp"
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
async function registerMcpHttpRoutes(app, service, options) {
  app.all("/mcp", {
    config: {
      rawBody: true
    }
  }, async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : void 0;
    if (service.auth?.kind === "bearer" && !token) {
      reply.status(401);
      return reply.send({
        error: "unauthorized",
        message: "Missing bearer token."
      });
    }
    try {
      await resolveAuth(service, {
        surface: "mcp",
        token,
        request
      });
    } catch (error) {
      const normalized = error instanceof AgentServiceError ? error : new AgentServiceError(
        500,
        "internal_error",
        error instanceof Error ? error.message : String(error)
      );
      reply.status(normalized.status);
      return reply.send({
        error: normalized.code,
        message: normalized.message,
        ...normalized.details === void 0 ? {} : { details: normalized.details }
      });
    }
    const mcpServer = createMcpServer(service, {
      createContext: options.createContext,
      tokenResolver: () => token,
      surface: "mcp"
    });
    const transport = new StreamableHTTPServerTransport(
      {
        sessionIdGenerator: void 0
      }
    );
    reply.raw.on("close", () => {
      void transport.close();
      void mcpServer.close();
    });
    try {
      await mcpServer.connect(transport);
      const req = request.raw;
      const res = reply.raw;
      const parsedBody = request.method === "POST" ? request.body : void 0;
      await transport.handleRequest(req, res, parsedBody);
      reply.hijack();
    } catch (error) {
      await transport.close();
      await mcpServer.close();
      if (!reply.raw.headersSent) {
        reply.status(500);
        return reply.send({
          error: "internal_error",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  });
}

// src/adapters/fastify.ts
async function resolveAuth2(service, options) {
  const auth = service.auth ?? { kind: "none" };
  if (auth.kind === "none") {
    return null;
  }
  const header = options.request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : void 0;
  if (!token) {
    throw new UnauthorizedError("Missing bearer token.");
  }
  const identity = await auth.verifyToken(token, {
    surface: options.surface,
    request: options.request
  });
  if (!identity) {
    throw new UnauthorizedError("Invalid bearer token.");
  }
  return identity;
}
function normalizeRequestError(error) {
  if (error instanceof AgentServiceError) {
    return error;
  }
  if (error instanceof ZodError2) {
    return new InvalidRequestError(
      "Request payload does not match the declared input schema.",
      error.issues
    );
  }
  return new AgentServiceError(
    500,
    "internal_error",
    error instanceof Error ? error.message : String(error)
  );
}
function sendServiceError(reply, error) {
  const serviceError = normalizeRequestError(error);
  reply.status(serviceError.status);
  return reply.send({
    error: serviceError.code,
    message: serviceError.message,
    ...serviceError.details === void 0 ? {} : { details: serviceError.details }
  });
}
async function registerServiceAdapters(app, service, options) {
  const operations = describeOperations(service);
  app.get("/health", async () => ({
    ok: true,
    service: service.id,
    version: service.version
  }));
  app.get("/", async () => buildAgentServiceManifest(service, {
    origin: options.origin,
    installCommand: options.installCommand,
    stdioCommand: options.stdioCommand
  }));
  app.get("/v1/capabilities", async () => ({
    id: service.id,
    name: service.name,
    version: service.version,
    description: service.description,
    auth: service.auth?.kind ?? "none",
    adapters: ["rest", "openapi", "mcp-http", "mcp-stdio", "cli", "skill", "llms"],
    artifacts: {
      manifest: options.origin,
      openapi: `${options.origin}/v1/openapi.json`,
      skill: `${options.origin}/artifacts/skill.md`,
      llms: `${options.origin}/llms.txt`,
      remoteMcp: `${options.origin}/mcp`,
      ...options.installCommand ? { cliSetupCommand: options.installCommand } : {},
      ...options.stdioCommand ? { stdioCommand: options.stdioCommand } : {}
    },
    operations: operations.map((operation) => ({
      key: operation.key,
      cliCommand: operation.cli.command,
      method: operation.rest.method,
      path: operation.rest.path,
      mcpTool: operation.mcp.toolName,
      scopes: operation.scopes,
      description: operation.description
    }))
  }));
  app.get("/v1/status", async (request, reply) => {
    try {
      const auth = await resolveAuth2(service, { surface: "rest", request });
      return {
        ok: true,
        service: {
          id: service.id,
          name: service.name,
          version: service.version
        },
        auth
      };
    } catch (error) {
      return sendServiceError(reply, error);
    }
  });
  app.get("/v1/openapi.json", async () => buildOpenApiSpec(service, { origin: options.origin }));
  app.get("/artifacts/skill.md", async (_request, reply) => {
    reply.type("text/markdown");
    return renderSkill(service, {
      origin: options.origin,
      installCommand: options.installCommand,
      stdioCommand: options.stdioCommand
    });
  });
  app.get("/llms.txt", async (_request, reply) => {
    reply.type("text/plain");
    return renderLlmsTxt(service, {
      origin: options.origin,
      installCommand: options.installCommand,
      stdioCommand: options.stdioCommand
    });
  });
  for (const operation of operations) {
    app.route({
      method: operation.rest.method,
      url: operation.rest.path,
      handler: async (request, reply) => {
        try {
          const auth = await resolveAuth2(service, { surface: "rest", request });
          ensureScopes(operation, auth);
          const rawInput = operation.rest.method === "GET" ? request.query ?? {} : request.body ?? {};
          let input;
          try {
            input = operation.input.parse(rawInput);
          } catch (error) {
            throw normalizeRequestError(error);
          }
          const serviceContext = await options.createContext();
          const context = {
            surface: "rest",
            service,
            serviceContext,
            auth,
            request
          };
          const result = await operation.handler(context, input);
          return validateOutput(operation.output, result);
        } catch (error) {
          return sendServiceError(reply, error);
        }
      }
    });
  }
  await registerMcpHttpRoutes(app, service, {
    createContext: options.createContext
  });
}

// src/adapters/cli.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { Command, InvalidArgumentError } from "commander";
function credentialsDir(serviceId) {
  return join(homedir(), ".agent-service", serviceId);
}
function credentialsPath(serviceId) {
  return join(credentialsDir(serviceId), "credentials.json");
}
function loadCredentials(serviceId) {
  const file = credentialsPath(serviceId);
  if (!existsSync(file)) {
    return null;
  }
  return JSON.parse(readFileSync(file, "utf-8"));
}
function saveCredentials(serviceId, credentials) {
  const dir = credentialsDir(serviceId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(credentialsPath(serviceId), JSON.stringify(credentials, null, 2));
}
async function requestJson(method, url, options) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...options.body ? { "Content-Type": "application/json" } : {},
      ...options.token ? { Authorization: `Bearer ${options.token}` } : {}
    },
    ...options.body ? { body: JSON.stringify(options.body) } : {}
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed (${response.status}): ${body}`);
  }
  return response.json();
}
function parseJsonPayload(value) {
  try {
    return JSON.parse(value);
  } catch {
    throw new InvalidArgumentError("Payload must be valid JSON.");
  }
}
function optionLabel(key) {
  return key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}
function optionValueDescription(key) {
  return key;
}
function buildOperationInput(declaredKeys, options) {
  const input = {};
  for (const key of declaredKeys) {
    if (options[key] !== void 0) {
      input[key] = options[key];
    }
  }
  return input;
}
function renderSetupHelp(service) {
  if (service.auth?.kind !== "bearer") {
    return null;
  }
  const helpLines = [
    "",
    ...service.auth.description ? [`Authentication: ${service.auth.description}`] : [],
    ...service.auth.cliSetup?.instructions ? [service.auth.cliSetup.instructions] : []
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
function createServiceCli(service) {
  const program = new Command();
  const binaryName = getBinaryName(service);
  const operations = describeOperations(service);
  program.name(binaryName).description(`${service.name} CLI`).showHelpAfterError();
  const setupCommand = program.command("setup").description(service.cli?.setupDescription ?? "Store origin and optional local authentication details.").requiredOption("--origin <url>", "Service origin, for example http://localhost:4010");
  if (service.auth?.kind === "bearer") {
    setupCommand.option("--token <value>", "Bearer token when the service requires authentication").option("--profile <id>", "Named profile defined by the service");
  }
  const setupHelp = renderSetupHelp(service);
  if (setupHelp) {
    setupCommand.addHelpText("after", setupHelp);
  }
  setupCommand.action((options) => {
    const profile = service.auth?.kind === "bearer" ? service.auth.cliSetup?.profiles?.find((candidate) => candidate.id === options.profile) : void 0;
    const token = options.token ?? profile?.token;
    if (service.auth?.kind === "bearer" && !token) {
      throw new Error("This service requires a token or known profile. Pass --token or --profile.");
    }
    saveCredentials(service.id, {
      origin: options.origin,
      token,
      profileId: profile?.id,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    console.log(`${service.name} configured for ${options.origin}`);
    if (profile) {
      console.log(`Profile: ${profile.label}`);
    }
  });
  program.command("status").description("Check service connectivity and verify authentication.").option("--json", "Print JSON output").action(async (options) => {
    const credentials = loadCredentials(service.id);
    if (!credentials) {
      throw new Error(`No credentials found. Run: ${binaryName} setup --origin <url>`);
    }
    const result = await requestJson("GET", `${credentials.origin}/v1/status`, {
      token: credentials.token
    });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`${service.name} is reachable at ${credentials.origin}`);
    console.log(JSON.stringify(result, null, 2));
  });
  for (const operation of operations) {
    const operationCommand = program.command(operation.cli.command).description(operation.cli.description).option("--payload <json>", "Raw JSON payload for complex inputs", parseJsonPayload).option("--json", "Print JSON output");
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
      const parsedFlags = options.payload !== void 0 ? options.payload : buildOperationInput(declaredKeys, options);
      const input = operation.input.parse(parsedFlags);
      const requestUrl = new URL(operation.rest.path, credentials.origin);
      const result = operation.rest.method === "GET" ? await requestJson(
        "GET",
        `${requestUrl.toString()}?${queryFromParsedInput(input).toString()}`,
        { token: credentials.token }
      ) : await requestJson(operation.rest.method, requestUrl.toString(), {
        token: credentials.token,
        body: input
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
    }
  };
}

// src/runtime.ts
import Fastify from "fastify";
function resolveRuntimeDetails(_service, options, overrides = {}) {
  const host = overrides.host ?? process.env.HOST ?? options.host ?? "127.0.0.1";
  const port = overrides.port ?? Number(process.env.PORT ?? options.port ?? 4010);
  const origin = typeof options.origin === "function" ? options.origin({ host, port }) : options.origin ?? `http://${host}:${port}`;
  return { host, port, origin };
}
function resolveInstallCommand(options, details, binaryName) {
  if (typeof options.installCommand === "function") {
    return options.installCommand(details);
  }
  return options.installCommand ?? `${binaryName} setup --origin ${details.origin}`;
}
function createNodeServiceRuntime(service, options) {
  const binaryName = getBinaryName(service);
  return {
    async createHttpApp(overrides = {}) {
      const details = resolveRuntimeDetails(service, options, overrides);
      const app = overrides.app ?? Fastify(options.fastify ?? { logger: false });
      await registerServiceAdapters(app, service, {
        origin: details.origin,
        createContext: options.createContext,
        installCommand: resolveInstallCommand(options, details, binaryName),
        stdioCommand: options.stdioCommand
      });
      return {
        app,
        ...details
      };
    },
    async startHttpServer(overrides = {}) {
      const runtime = await this.createHttpApp(overrides);
      await runtime.app.listen({
        host: runtime.host,
        port: runtime.port
      });
      return runtime;
    },
    async runCli(argv = process.argv) {
      await createServiceCli(service).run(argv);
    },
    async startStdioMcp() {
      return await startStdioMcpServer(service, {
        createContext: options.createContext,
        token: options.resolveStdioToken?.()
      });
    },
    async run(argv = process.argv) {
      const [node, script, mode = "serve", ...rest] = argv;
      if (mode === "serve" || mode === "http") {
        const runtime = await this.startHttpServer();
        console.log(`${service.id} listening on ${runtime.origin}`);
        return runtime;
      }
      if (mode === "cli") {
        await this.runCli([node, script, ...rest]);
        return null;
      }
      if (mode === "mcp") {
        await this.startStdioMcp();
        return null;
      }
      throw new Error(
        `Unknown runtime mode "${mode}". Use one of: serve, cli, mcp.`
      );
    }
  };
}
export {
  AgentServiceError,
  ForbiddenError,
  InvalidOutputError,
  InvalidRequestError,
  UnauthorizedError,
  buildAgentServiceManifest,
  buildOpenApiSpec,
  createMcpServer,
  createNodeServiceRuntime,
  createServiceCli,
  defineAgentService,
  describeOperations,
  getBinaryName,
  registerMcpHttpRoutes,
  registerServiceAdapters,
  renderLlmsTxt,
  renderSkill,
  scaffoldServiceProject,
  startStdioMcpServer
};
//# sourceMappingURL=index.js.map