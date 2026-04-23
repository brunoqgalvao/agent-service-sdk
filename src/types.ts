import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { ZodTypeAny } from "zod";

export type Surface = "rest" | "cli" | "mcp" | "openapi";
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type AuthIdentity = {
  actorId?: string;
  profileId?: string;
  scopes?: string[];
  metadata?: Record<string, unknown>;
} | null;

export type AuthCredentialAcquisition = {
  type: "user-provided" | "oauth2" | "demo" | "custom";
  instructions: string;
  tokenUrl?: string;
  authorizationUrl?: string;
  scopes?: string[];
  profiles?: Array<{
    id: string;
    label: string;
    description?: string;
    token?: string;
  }>;
};

export type AuthDefinition =
  | {
      kind: "none";
    }
  | {
      kind: "bearer";
      description?: string;
      credentialAcquisition?: AuthCredentialAcquisition;
      cliSetup?: {
        instructions?: string;
        profiles?: Array<{
          id: string;
          label: string;
          token: string;
          description?: string;
        }>;
      };
      verifyToken: (token: string, context: { surface: Surface; request?: FastifyRequest }) => Promise<AuthIdentity> | AuthIdentity;
    };

export type OperationSurfaceConfig = {
  rest?: {
    method?: HttpMethod;
    path?: string;
    openapi?: boolean;
  };
  cli?: {
    command?: string;
    description?: string;
  };
  mcp?: {
    toolName?: string;
    description?: string;
  };
};

export type ServiceExecutionContext<TServiceContext> = {
  surface: Exclude<Surface, "openapi">;
  service: AgentServiceDefinition<TServiceContext>;
  serviceContext: TServiceContext;
  auth: AuthIdentity;
  request?: FastifyRequest;
};

export type AgentOperationDefinition<
  TServiceContext,
  TInputSchema extends ZodTypeAny,
  TResult = unknown,
> = {
  title?: string;
  description: string;
  input: TInputSchema;
  output?: ZodTypeAny;
  scopes?: string[];
  surfaces?: OperationSurfaceConfig;
  handler: (
    context: ServiceExecutionContext<TServiceContext>,
    input: z.infer<TInputSchema>,
  ) => Promise<TResult> | TResult;
};

export type AgentServiceDefinition<TServiceContext> = {
  id: string;
  name: string;
  version: string;
  description: string;
  basePath?: string;
  auth?: AuthDefinition;
  cli?: {
    binaryName?: string;
    setupDescription?: string;
  };
  operations: Record<string, AgentOperationDefinition<TServiceContext, ZodTypeAny>>;
};

export type OperationDescriptor<TServiceContext> = {
  key: string;
  slug: string;
  title: string;
  description: string;
  input: ZodTypeAny;
  output?: ZodTypeAny;
  scopes: string[];
  rest: {
    method: HttpMethod;
    path: string;
    openapi: boolean;
  };
  cli: {
    command: string;
    description: string;
  };
  mcp: {
    toolName: string;
    description: string;
  };
  handler: AgentOperationDefinition<TServiceContext, ZodTypeAny>["handler"];
};

export type CliCredentials = {
  origin: string;
  token?: string;
  profileId?: string;
  updatedAt: string;
};
