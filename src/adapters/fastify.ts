import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import { describeOperations } from "../service.js";
import { renderLlmsTxt } from "../artifacts/llms.js";
import { renderSkill } from "../artifacts/skill.js";
import { buildOpenApiSpec } from "./openapi.js";
import { registerMcpHttpRoutes } from "./mcp.js";
import { AgentServiceError, InvalidRequestError, UnauthorizedError } from "../errors.js";
import { ensureScopes, validateOutput } from "../lib/runtime.js";
import type { AgentServiceDefinition, AuthIdentity, ServiceExecutionContext, Surface } from "../types.js";

async function resolveAuth<TServiceContext>(
  service: AgentServiceDefinition<TServiceContext>,
  options: { surface: Surface; request: FastifyRequest },
): Promise<AuthIdentity> {
  const auth = service.auth ?? { kind: "none" as const };
  if (auth.kind === "none") {
    return null;
  }

  const header = options.request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    throw new UnauthorizedError("Missing bearer token.");
  }

  const identity = await auth.verifyToken(token, {
    surface: options.surface,
    request: options.request,
  });

  if (!identity) {
    throw new UnauthorizedError("Invalid bearer token.");
  }

  return identity;
}

function normalizeRequestError(error: unknown): AgentServiceError {
  if (error instanceof AgentServiceError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new InvalidRequestError(
      "Request payload does not match the declared input schema.",
      error.issues,
    );
  }

  return new AgentServiceError(
    500,
    "internal_error",
    error instanceof Error ? error.message : String(error),
  );
}

function sendServiceError(reply: FastifyReply, error: unknown) {
  const serviceError = normalizeRequestError(error);
  reply.status(serviceError.status);
  return reply.send({
    error: serviceError.code,
    message: serviceError.message,
    ...(serviceError.details === undefined ? {} : { details: serviceError.details }),
  });
}

export async function registerServiceAdapters<TServiceContext>(
  app: FastifyInstance,
  service: AgentServiceDefinition<TServiceContext>,
  options: {
    origin: string;
    createContext: () => Promise<TServiceContext> | TServiceContext;
    installCommand?: string;
    stdioCommand?: string;
  },
) {
  const operations = describeOperations(service);

  app.get("/health", async () => ({
    ok: true,
    service: service.id,
    version: service.version,
  }));

  app.get("/v1/capabilities", async () => ({
    id: service.id,
    name: service.name,
    version: service.version,
    description: service.description,
    auth: service.auth?.kind ?? "none",
    adapters: ["rest", "openapi", "mcp-http", "mcp-stdio", "cli", "skill", "llms"],
    artifacts: {
      openapi: `${options.origin}/v1/openapi.json`,
      skill: `${options.origin}/artifacts/skill.md`,
      llms: `${options.origin}/llms.txt`,
      remoteMcp: `${options.origin}/mcp`,
      ...(options.installCommand ? { cliSetupCommand: options.installCommand } : {}),
      ...(options.stdioCommand ? { stdioCommand: options.stdioCommand } : {}),
    },
    operations: operations.map((operation) => ({
      key: operation.key,
      cliCommand: operation.cli.command,
      method: operation.rest.method,
      path: operation.rest.path,
      mcpTool: operation.mcp.toolName,
      scopes: operation.scopes,
      description: operation.description,
    })),
  }));

  app.get("/v1/status", async (request, reply) => {
    try {
      const auth = await resolveAuth(service, { surface: "rest", request });
      return {
        ok: true,
        service: {
          id: service.id,
          name: service.name,
          version: service.version,
        },
        auth,
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
      stdioCommand: options.stdioCommand,
    });
  });

  app.get("/llms.txt", async (_request, reply) => {
    reply.type("text/plain");
    return renderLlmsTxt(service, {
      origin: options.origin,
      installCommand: options.installCommand,
      stdioCommand: options.stdioCommand,
    });
  });

  for (const operation of operations) {
    app.route({
      method: operation.rest.method,
      url: operation.rest.path,
      handler: async (request, reply) => {
        try {
          const auth: AuthIdentity = await resolveAuth(service, { surface: "rest", request });
          ensureScopes(operation, auth);

          const rawInput = operation.rest.method === "GET"
            ? ((request.query as Record<string, unknown>) ?? {})
            : ((request.body as Record<string, unknown>) ?? {});

          let input: unknown;
          try {
            input = operation.input.parse(rawInput);
          } catch (error) {
            throw normalizeRequestError(error);
          }

          const serviceContext = await options.createContext();
          const context: ServiceExecutionContext<TServiceContext> = {
            surface: "rest",
            service,
            serviceContext,
            auth,
            request,
          };

          const result = await operation.handler(context, input as never);
          return validateOutput(operation.output, result);
        } catch (error) {
          return sendServiceError(reply, error);
        }
      },
    });
  }

  await registerMcpHttpRoutes(app, service, {
    createContext: options.createContext,
  });
}
