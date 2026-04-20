import type { AgentServiceDefinition, OperationDescriptor } from "./types.js";
import { defaultHttpMethod } from "./lib/schema.js";
import { slugify, snakeCase } from "./lib/slug.js";

export function defineAgentService<TServiceContext>(
  definition: AgentServiceDefinition<TServiceContext>,
): AgentServiceDefinition<TServiceContext> {
  return definition;
}

export function getBinaryName<TServiceContext>(service: AgentServiceDefinition<TServiceContext>): string {
  return service.cli?.binaryName ?? slugify(service.id);
}

export function getBasePath<TServiceContext>(service: AgentServiceDefinition<TServiceContext>): string {
  return service.basePath ?? "/api/agent";
}

export function describeOperations<TServiceContext>(
  service: AgentServiceDefinition<TServiceContext>,
): Array<OperationDescriptor<TServiceContext>> {
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
        openapi: operation.surfaces?.rest?.openapi ?? true,
      },
      cli: {
        command: cliCommand,
        description: operation.surfaces?.cli?.description ?? operation.description,
      },
      mcp: {
        toolName,
        description: operation.surfaces?.mcp?.description ?? operation.description,
      },
      handler: operation.handler,
    };
  });
}
