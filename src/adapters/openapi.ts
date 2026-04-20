import type { AgentServiceDefinition } from "../types.js";
import { describeOperations } from "../service.js";
import { getObjectShape, schemaToJsonSchema } from "../lib/schema.js";

const errorResponseSchema = {
  type: "object",
  properties: {
    error: { type: "string" },
    message: { type: "string" },
    details: {},
  },
  required: ["error", "message"],
  additionalProperties: true,
};

function errorResponse(description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: errorResponseSchema,
      },
    },
  };
}

export function buildOpenApiSpec<TServiceContext>(
  service: AgentServiceDefinition<TServiceContext>,
  options: { origin: string },
) {
  const operations = describeOperations(service);
  const paths: Record<string, Record<string, unknown>> = {};

  for (const operation of operations) {
    if (!operation.rest.openapi) {
      continue;
    }

    const method = operation.rest.method.toLowerCase();
    const responses: Record<string, unknown> = {
      200: {
        description: "Successful response",
        ...(operation.output
          ? {
              content: {
                "application/json": {
                  schema: schemaToJsonSchema(operation.output, `${service.id}_${operation.slug}_response`),
                },
              },
            }
          : {}),
      },
      400: errorResponse("Invalid request payload or query string."),
      500: errorResponse("Internal server error or invalid service output."),
    };

    if (service.auth?.kind === "bearer") {
      responses["401"] = errorResponse("Missing or invalid bearer token.");
    }

    if (operation.scopes.length > 0) {
      responses["403"] = errorResponse("Authenticated caller is missing required scopes.");
    }

    const endpoint: Record<string, unknown> = {
      summary: operation.title,
      description: operation.description,
      operationId: `${service.id}.${operation.key}`,
      responses,
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
        schema: schemaToJsonSchema(schema, `${service.id}_${operation.slug}_${key}`),
      }));
    } else {
      endpoint.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: schemaToJsonSchema(operation.input, `${service.id}_${operation.slug}_request`),
          },
        },
      };
    }

    paths[operation.rest.path] = {
      ...(paths[operation.rest.path] ?? {}),
      [method]: endpoint,
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: `${service.name} Agent API`,
      version: service.version,
      description: service.description,
    },
    servers: [{ url: options.origin }],
    components: {
      securitySchemes: service.auth?.kind === "bearer"
        ? {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
            },
          }
        : {},
    },
    ...(service.auth?.kind === "bearer" ? { security: [{ bearerAuth: [] }] } : {}),
    paths,
  };
}
