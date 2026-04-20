import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import { registerServiceAdapters } from "./adapters/fastify.js";
import { createServiceCli } from "./adapters/cli.js";
import { startStdioMcpServer } from "./adapters/mcp.js";
import { getBinaryName } from "./service.js";
import type { AgentServiceDefinition } from "./types.js";

type RuntimeDetails = {
  host: string;
  port: number;
  origin: string;
};

export type NodeServiceRuntimeOptions<TServiceContext> = {
  createContext: () => Promise<TServiceContext> | TServiceContext;
  host?: string;
  port?: number;
  origin?: string | ((details: { host: string; port: number }) => string);
  installCommand?: string | ((details: RuntimeDetails) => string);
  stdioCommand?: string;
  resolveStdioToken?: () => string | undefined;
  fastify?: Parameters<typeof Fastify>[0];
};

function resolveRuntimeDetails<TServiceContext>(
  _service: AgentServiceDefinition<TServiceContext>,
  options: NodeServiceRuntimeOptions<TServiceContext>,
  overrides: { host?: string; port?: number } = {},
): RuntimeDetails {
  const host = overrides.host ?? process.env.HOST ?? options.host ?? "127.0.0.1";
  const port = overrides.port ?? Number(process.env.PORT ?? options.port ?? 4010);
  const origin = typeof options.origin === "function"
    ? options.origin({ host, port })
    : options.origin ?? `http://${host}:${port}`;

  return { host, port, origin };
}

function resolveInstallCommand<TServiceContext>(
  options: NodeServiceRuntimeOptions<TServiceContext>,
  details: RuntimeDetails,
  binaryName: string,
): string | undefined {
  if (typeof options.installCommand === "function") {
    return options.installCommand(details);
  }

  return options.installCommand ?? `${binaryName} setup --origin ${details.origin}`;
}

export function createNodeServiceRuntime<TServiceContext>(
  service: AgentServiceDefinition<TServiceContext>,
  options: NodeServiceRuntimeOptions<TServiceContext>,
) {
  const binaryName = getBinaryName(service);

  return {
    async createHttpApp(overrides: { host?: string; port?: number; app?: FastifyInstance } = {}) {
      const details = resolveRuntimeDetails(service, options, overrides);
      const app = overrides.app ?? Fastify(options.fastify ?? { logger: false });

      await registerServiceAdapters(app, service, {
        origin: details.origin,
        createContext: options.createContext,
        installCommand: resolveInstallCommand(options, details, binaryName),
        stdioCommand: options.stdioCommand,
      });

      return {
        app,
        ...details,
      };
    },

    async startHttpServer(overrides: { host?: string; port?: number; app?: FastifyInstance } = {}) {
      const runtime = await this.createHttpApp(overrides);
      await runtime.app.listen({
        host: runtime.host,
        port: runtime.port,
      });

      return runtime;
    },

    async runCli(argv = process.argv) {
      await createServiceCli(service).run(argv);
    },

    async startStdioMcp() {
      return await startStdioMcpServer(service, {
        createContext: options.createContext,
        token: options.resolveStdioToken?.(),
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
        `Unknown runtime mode "${mode}". Use one of: serve, cli, mcp.`,
      );
    },
  };
}
