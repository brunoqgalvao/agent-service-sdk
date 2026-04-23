import * as fastify from 'fastify';
import fastify__default, { FastifyRequest, FastifyInstance } from 'fastify';
import { ZodTypeAny, z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as _modelcontextprotocol_sdk_server_mcp from '@modelcontextprotocol/sdk/server/mcp';
import * as http from 'http';

type Surface = "rest" | "cli" | "mcp" | "openapi";
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type AuthIdentity = {
    actorId?: string;
    profileId?: string;
    scopes?: string[];
    metadata?: Record<string, unknown>;
} | null;
type AuthDefinition = {
    kind: "none";
} | {
    kind: "bearer";
    description?: string;
    cliSetup?: {
        instructions?: string;
        profiles?: Array<{
            id: string;
            label: string;
            token: string;
            description?: string;
        }>;
    };
    verifyToken: (token: string, context: {
        surface: Surface;
        request?: FastifyRequest;
    }) => Promise<AuthIdentity> | AuthIdentity;
};
type OperationSurfaceConfig = {
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
type ServiceExecutionContext<TServiceContext> = {
    surface: Exclude<Surface, "openapi">;
    service: AgentServiceDefinition<TServiceContext>;
    serviceContext: TServiceContext;
    auth: AuthIdentity;
    request?: FastifyRequest;
};
type AgentOperationDefinition<TServiceContext, TInputSchema extends ZodTypeAny, TResult = unknown> = {
    title?: string;
    description: string;
    input: TInputSchema;
    output?: ZodTypeAny;
    scopes?: string[];
    surfaces?: OperationSurfaceConfig;
    handler: (context: ServiceExecutionContext<TServiceContext>, input: z.infer<TInputSchema>) => Promise<TResult> | TResult;
};
type AgentServiceDefinition<TServiceContext> = {
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
type OperationDescriptor<TServiceContext> = {
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
type CliCredentials = {
    origin: string;
    token?: string;
    profileId?: string;
    updatedAt: string;
};

declare function defineAgentService<TServiceContext>(definition: AgentServiceDefinition<TServiceContext>): AgentServiceDefinition<TServiceContext>;
declare function getBinaryName<TServiceContext>(service: AgentServiceDefinition<TServiceContext>): string;
declare function describeOperations<TServiceContext>(service: AgentServiceDefinition<TServiceContext>): Array<OperationDescriptor<TServiceContext>>;

declare function registerServiceAdapters<TServiceContext>(app: FastifyInstance, service: AgentServiceDefinition<TServiceContext>, options: {
    origin: string;
    createContext: () => Promise<TServiceContext> | TServiceContext;
    installCommand?: string;
    stdioCommand?: string;
}): Promise<void>;

declare function buildOpenApiSpec<TServiceContext>(service: AgentServiceDefinition<TServiceContext>, options: {
    origin: string;
}): {
    paths: Record<string, Record<string, unknown>>;
    security?: {
        bearerAuth: never[];
    }[] | undefined;
    openapi: string;
    info: {
        title: string;
        version: string;
        description: string;
    };
    servers: {
        url: string;
    }[];
    components: {
        securitySchemes: {
            bearerAuth: {
                type: string;
                scheme: string;
            };
        } | {
            bearerAuth?: undefined;
        };
    };
};

declare function createMcpServer<TServiceContext>(service: AgentServiceDefinition<TServiceContext>, options: {
    createContext: () => Promise<TServiceContext> | TServiceContext;
    tokenResolver?: (request?: FastifyRequest) => string | undefined;
    surface: "mcp";
}): McpServer;
declare function startStdioMcpServer<TServiceContext>(service: AgentServiceDefinition<TServiceContext>, options: {
    createContext: () => Promise<TServiceContext> | TServiceContext;
    token?: string;
}): Promise<McpServer>;
declare function registerMcpHttpRoutes<TServiceContext>(app: FastifyInstance, service: AgentServiceDefinition<TServiceContext>, options: {
    createContext: () => Promise<TServiceContext> | TServiceContext;
}): Promise<void>;

declare function createServiceCli<TServiceContext>(service: AgentServiceDefinition<TServiceContext>): {
    run(argv?: string[]): Promise<void>;
};

type RuntimeDetails = {
    host: string;
    port: number;
    origin: string;
};
type NodeServiceRuntimeOptions<TServiceContext> = {
    createContext: () => Promise<TServiceContext> | TServiceContext;
    host?: string;
    port?: number;
    origin?: string | ((details: {
        host: string;
        port: number;
    }) => string);
    installCommand?: string | ((details: RuntimeDetails) => string);
    stdioCommand?: string;
    resolveStdioToken?: () => string | undefined;
    fastify?: Parameters<typeof fastify__default>[0];
};
declare function createNodeServiceRuntime<TServiceContext>(service: AgentServiceDefinition<TServiceContext>, options: NodeServiceRuntimeOptions<TServiceContext>): {
    createHttpApp(overrides?: {
        host?: string;
        port?: number;
        app?: FastifyInstance;
    }): Promise<{
        host: string;
        port: number;
        origin: string;
        app: FastifyInstance<fastify.RawServerDefault, http.IncomingMessage, http.ServerResponse<http.IncomingMessage>, fastify.FastifyBaseLogger, fastify.FastifyTypeProviderDefault>;
    }>;
    startHttpServer(overrides?: {
        host?: string;
        port?: number;
        app?: FastifyInstance;
    }): Promise<{
        host: string;
        port: number;
        origin: string;
        app: FastifyInstance<fastify.RawServerDefault, http.IncomingMessage, http.ServerResponse<http.IncomingMessage>, fastify.FastifyBaseLogger, fastify.FastifyTypeProviderDefault>;
    }>;
    runCli(argv?: string[]): Promise<void>;
    startStdioMcp(): Promise<_modelcontextprotocol_sdk_server_mcp.McpServer>;
    run(argv?: string[]): Promise<{
        host: string;
        port: number;
        origin: string;
        app: FastifyInstance<fastify.RawServerDefault, http.IncomingMessage, http.ServerResponse<http.IncomingMessage>, fastify.FastifyBaseLogger, fastify.FastifyTypeProviderDefault>;
    } | null>;
};

type ScaffoldServiceProjectOptions = {
    targetDir: string;
    serviceId: string;
    serviceName?: string;
    description?: string;
    port?: number;
    sdkDependency?: string;
    template?: "basic" | "bearer";
};
declare function scaffoldServiceProject(options: ScaffoldServiceProjectOptions): Promise<{
    targetDir: string;
    serviceId: string;
    serviceName: string;
    packageName: string;
    port: number;
    template: "basic" | "bearer";
}>;

declare function renderSkill<TServiceContext>(service: AgentServiceDefinition<TServiceContext>, options: {
    origin: string;
    installCommand?: string;
    stdioCommand?: string;
}): string;

declare function renderLlmsTxt<TServiceContext>(service: AgentServiceDefinition<TServiceContext>, options: {
    origin: string;
    installCommand?: string;
    stdioCommand?: string;
}): string;

type AgentServiceManifestOptions = {
    origin: string;
    installCommand?: string;
    stdioCommand?: string;
};
declare function buildAgentServiceManifest<TServiceContext>(service: AgentServiceDefinition<TServiceContext>, options: AgentServiceManifestOptions): {
    manifestVersion: string;
    kind: string;
    instruction: string;
    humanPrompt: string;
    service: {
        id: string;
        name: string;
        version: string;
        description: string;
    };
    auth: {
        kind: string;
        required: boolean;
        instructions: string;
        httpHeader: null;
        description?: undefined;
        profiles?: undefined;
    } | {
        kind: string;
        required: boolean;
        description: string;
        instructions: string;
        httpHeader: {
            name: string;
            valueFormat: string;
            appliesTo: string[];
        };
        profiles: {
            id: string;
            label: string;
            description: string | undefined;
        }[];
    };
    operations: {
        key: string;
        title: string;
        description: string;
        scopes: string[];
        inputSchema: object & {
            $schema?: string | undefined;
            definitions?: {
                [key: string]: object;
            } | undefined;
        };
        outputSchema: (object & {
            $schema?: string | undefined;
            definitions?: {
                [key: string]: object;
            } | undefined;
        }) | null;
        interfaces: {
            rest: {
                method: HttpMethod;
                path: string;
            };
            mcp: {
                toolName: string;
            };
            cli: {
                command: string;
            };
        };
    }[];
    quickstart: {
        steps: string[];
        auth: {
            required: boolean;
            header: {
                name: string;
                valueFormat: string;
                example: string;
            };
            tokenVariable: string;
            appliesTo: string[];
        } | {
            required: boolean;
            header?: undefined;
            tokenVariable?: undefined;
            appliesTo?: undefined;
        };
        mcpHttp: {
            url: string;
            package: string;
            transport: string;
            authHeaderLocation: string | null;
            connectNotes: string[];
            typescriptExample: string;
        };
        rest: {
            baseUrl: string;
            authHeaderLocation: string | null;
            exampleRead: {
                operationKey: string;
                method: HttpMethod;
                url: string;
                headers: {
                    Authorization: string;
                } | {
                    Authorization?: undefined;
                };
            } | null;
        };
        errorHandling: ({
            condition: string;
            restStatus: number;
            mcpHttpBehavior: string;
            writeOperationExample?: undefined;
        } | {
            condition: string;
            restStatus: number;
            mcpHttpBehavior: string;
            writeOperationExample: string | null;
        })[];
    };
    interfaces: {
        mcpStdio?: {
            command: string;
        } | undefined;
        preferredOrder: string[];
        mcpHttp: {
            url: string;
            transport: string;
            tools: string[];
        };
        openapi: {
            url: string;
            spec: {
                paths: Record<string, Record<string, unknown>>;
                security?: {
                    bearerAuth: never[];
                }[] | undefined;
                openapi: string;
                info: {
                    title: string;
                    version: string;
                    description: string;
                };
                servers: {
                    url: string;
                }[];
                components: {
                    securitySchemes: {
                        bearerAuth: {
                            type: string;
                            scheme: string;
                        };
                    } | {
                        bearerAuth?: undefined;
                    };
                };
            };
        };
        rest: {
            baseUrl: string;
            operations: {
                key: string;
                method: HttpMethod;
                path: string;
            }[];
        };
        cli: {
            binaryName: string;
            setupCommand: string;
        };
    };
    artifacts: {
        skillMarkdown: string;
        llmsTxt: string;
    };
};

declare class AgentServiceError extends Error {
    status: number;
    code: string;
    details?: unknown | undefined;
    constructor(status: number, code: string, message: string, details?: unknown | undefined);
}
declare class UnauthorizedError extends AgentServiceError {
    constructor(message?: string);
}
declare class ForbiddenError extends AgentServiceError {
    constructor(message?: string, details?: unknown);
}
declare class InvalidRequestError extends AgentServiceError {
    constructor(message?: string, details?: unknown);
}
declare class InvalidOutputError extends AgentServiceError {
    constructor(message?: string, details?: unknown);
}

export { type AgentOperationDefinition, type AgentServiceDefinition, AgentServiceError, type AgentServiceManifestOptions, type AuthDefinition, type AuthIdentity, type CliCredentials, ForbiddenError, type HttpMethod, InvalidOutputError, InvalidRequestError, type NodeServiceRuntimeOptions, type OperationDescriptor, type OperationSurfaceConfig, type ScaffoldServiceProjectOptions, type ServiceExecutionContext, type Surface, UnauthorizedError, buildAgentServiceManifest, buildOpenApiSpec, createMcpServer, createNodeServiceRuntime, createServiceCli, defineAgentService, describeOperations, getBinaryName, registerMcpHttpRoutes, registerServiceAdapters, renderLlmsTxt, renderSkill, scaffoldServiceProject, startStdioMcpServer };
