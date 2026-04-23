import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { ZodRawShape } from "zod";

import { describeOperations } from "../service.js";
import { AgentServiceError, InvalidRequestError, UnauthorizedError } from "../errors.js";
import { ensureScopes, validateOutput } from "../lib/runtime.js";
import type { AgentServiceDefinition, AuthIdentity, ServiceExecutionContext, Surface } from "../types.js";
import { getObjectShape } from "../lib/schema.js";

async function resolveAuth<TServiceContext>(
  service: AgentServiceDefinition<TServiceContext>,
  options: { surface: Surface; token?: string; request?: FastifyRequest },
): Promise<AuthIdentity> {
  const auth = service.auth ?? { kind: "none" as const };

  if (auth.kind === "none") {
    return null;
  }

  if (!options.token) {
    throw new UnauthorizedError("Missing bearer token.");
  }

  const identity = await auth.verifyToken(options.token, {
    surface: options.surface,
    request: options.request,
  });

  if (!identity) {
    throw new UnauthorizedError("Invalid bearer token.");
  }

  return identity;
}

function zodRawShapeFromOperationShape(shape: Record<string, unknown>): ZodRawShape {
  return shape as ZodRawShape;
}

function serializeMcpError(error: unknown): {
  isError: true;
  structuredContent: Record<string, unknown>;
  content: Array<{ type: "text"; text: string }>;
} {
  const normalized = error instanceof AgentServiceError
    ? error
    : error instanceof ZodError
      ? new InvalidRequestError(
          "Request payload does not match the declared input schema.",
          error.issues,
        )
      : new AgentServiceError(
          500,
          "internal_error",
          error instanceof Error ? error.message : String(error),
        );
  const body = {
    error: normalized.code,
    status: normalized.status,
    message: normalized.message,
    ...(normalized.details === undefined ? {} : { details: normalized.details }),
  };

  return {
    isError: true,
    structuredContent: body,
    content: [
      {
        type: "text",
        text: JSON.stringify(body, null, 2),
      },
    ],
  };
}

export function createMcpServer<TServiceContext>(
  service: AgentServiceDefinition<TServiceContext>,
  options: {
    createContext: () => Promise<TServiceContext> | TServiceContext;
    tokenResolver?: (request?: FastifyRequest) => string | undefined;
    surface: "mcp";
  },
) {
  const server = new McpServer({
    name: service.id,
    version: service.version,
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
        ...(outputShape ? { outputSchema: zodRawShapeFromOperationShape(outputShape) } : {}),
      },
      async (input) => {
        try {
          const requestToken = options.tokenResolver?.();
          const auth = await resolveAuth(service, {
            surface: "mcp",
            token: requestToken,
          });
          ensureScopes(operation, auth);

          const serviceContext = await options.createContext();
          const context: ServiceExecutionContext<TServiceContext> = {
            surface: "mcp",
            service,
            serviceContext,
            auth,
          };
          const parsed = operation.input.parse(input);
          const result = validateOutput(
            operation.output,
            await operation.handler(context, parsed),
          );

          if (typeof result === "object" && result !== null && !Array.isArray(result)) {
            return {
              structuredContent: result as Record<string, unknown>,
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            };
          }

          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          return serializeMcpError(error);
        }
      },
    );
  }

  return server;
}

export async function startStdioMcpServer<TServiceContext>(
  service: AgentServiceDefinition<TServiceContext>,
  options: {
    createContext: () => Promise<TServiceContext> | TServiceContext;
    token?: string;
  },
) {
  const server = createMcpServer(service, {
    createContext: options.createContext,
    tokenResolver: () => options.token,
    surface: "mcp",
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}

export async function registerMcpHttpRoutes<TServiceContext>(
  app: FastifyInstance,
  service: AgentServiceDefinition<TServiceContext>,
  options: {
    createContext: () => Promise<TServiceContext> | TServiceContext;
  },
) {
  app.all("/mcp", {
    config: {
      rawBody: true,
    },
  }, async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

    if (service.auth?.kind === "bearer" && !token) {
      reply.status(401);
      return reply.send({
        error: "unauthorized",
        message: "Missing bearer token.",
      });
    }

    try {
      await resolveAuth(service, {
        surface: "mcp",
        token,
        request,
      });
    } catch (error) {
      const normalized = error instanceof AgentServiceError
        ? error
        : new AgentServiceError(
            500,
            "internal_error",
            error instanceof Error ? error.message : String(error),
          );
      reply.status(normalized.status);
      return reply.send({
        error: normalized.code,
        message: normalized.message,
        ...(normalized.details === undefined ? {} : { details: normalized.details }),
      });
    }

    const mcpServer = createMcpServer(service, {
      createContext: options.createContext,
      tokenResolver: () => token,
      surface: "mcp",
    });
    const transport = new StreamableHTTPServerTransport(
      {
        sessionIdGenerator: undefined,
      },
    );

    reply.raw.on("close", () => {
      void transport.close();
      void mcpServer.close();
    });

    try {
      await mcpServer.connect(transport as Parameters<typeof mcpServer.connect>[0]);

      const req = request.raw;
      const res = reply.raw;
      const parsedBody = request.method === "POST" ? request.body : undefined;

      await transport.handleRequest(req, res, parsedBody);
      reply.hijack();
    } catch (error) {
      await transport.close();
      await mcpServer.close();

      if (!reply.raw.headersSent) {
        reply.status(500);
        return reply.send({
          error: "internal_error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });
}
