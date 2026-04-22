// src/scaffold.ts
import { mkdir, readdir, writeFile } from "fs/promises";
import { join, resolve } from "path";
function titleCaseFromSlug(value) {
  return value.split(/[-_]/g).filter(Boolean).map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1)).join(" ");
}
function camelCase(value) {
  const parts = value.split(/[-_]/g).filter(Boolean);
  if (parts.length === 0) {
    return "service";
  }
  return parts.map((segment, index) => index === 0 ? segment.charAt(0).toLowerCase() + segment.slice(1) : segment.charAt(0).toUpperCase() + segment.slice(1)).join("");
}
async function ensureEmptyDirectory(targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(targetDir);
  if (entries.length > 0) {
    throw new Error(`Target directory is not empty: ${targetDir}`);
  }
}
function packageJsonContent(options) {
  return `${JSON.stringify({
    name: options.packageName,
    private: true,
    type: "module",
    description: options.description,
    scripts: {
      dev: "tsx src/runtime.ts serve",
      cli: "tsx src/runtime.ts cli",
      mcp: "tsx src/runtime.ts mcp",
      typecheck: "tsc --noEmit"
    },
    dependencies: {
      "agent-service-sdk": options.sdkDependency,
      zod: "^3.25.76"
    },
    devDependencies: {
      "@types/node": "^24.3.0",
      tsx: "^4.20.5",
      typescript: "^5.9.2"
    }
  }, null, 2)}
`;
}
function tsconfigContent() {
  return `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
`;
}
function basicServiceFileContent(options) {
  return `import { z } from "zod";
import { defineAgentService } from "agent-service-sdk";

export type ${options.contextTypeName} = {
  records: Array<{
    id: string;
    title: string;
    category: string;
    summary: string;
  }>;
};

export const ${options.serviceExportName} = defineAgentService<${options.contextTypeName}>({
  id: "${options.serviceId}",
  name: "${options.serviceName}",
  version: "0.1.0",
  description: "${options.description}",
  operations: {
    search_records: {
      title: "Search Records",
      description: "Search records by title or category.",
      input: z.object({
        query: z.string().default(""),
        category: z.string().optional(),
      }),
      output: z.object({
        results: z.array(z.object({
          id: z.string(),
          title: z.string(),
          category: z.string(),
          summary: z.string(),
        })),
      }),
      handler: ({ serviceContext }, input) => {
        const query = input.query.toLowerCase();
        const results = serviceContext.records.filter((record) => {
          const queryMatch = !query || record.title.toLowerCase().includes(query);
          const categoryMatch = !input.category || record.category.toLowerCase() === input.category.toLowerCase();
          return queryMatch && categoryMatch;
        });

        return { results };
      },
    },
    save_record: {
      title: "Save Record",
      description: "Save a new record to the in-memory service store.",
      input: z.object({
        title: z.string().min(1),
        category: z.string().min(1),
        summary: z.string().min(1),
      }),
      output: z.object({
        ok: z.boolean(),
        recordCount: z.number(),
      }),
      surfaces: {
        rest: {
          method: "POST",
        },
      },
      handler: ({ serviceContext }, input) => {
        serviceContext.records.push({
          id: \`rec_\${serviceContext.records.length + 1}\`,
          ...input,
        });

        return {
          ok: true,
          recordCount: serviceContext.records.length,
        };
      },
    },
  },
});

export function ${options.contextFactoryName}(): ${options.contextTypeName} {
  return {
    records: [
      {
        id: "rec_1",
        title: "Quarterly Metrics",
        category: "analytics",
        summary: "High-level KPI snapshot used for demo searches.",
      },
      {
        id: "rec_2",
        title: "Vendor Checklist",
        category: "operations",
        summary: "Operational readiness checklist for a mock service.",
      },
    ],
  };
}
`;
}
function bearerServiceFileContent(options) {
  return `import { z } from "zod";
import { defineAgentService } from "agent-service-sdk";

const profiles = [
  {
    id: "reader",
    label: "Read Only",
    token: "demo-reader-token",
    scopes: ["records.read"],
    description: "Read-only access for the scaffolded service.",
  },
  {
    id: "editor",
    label: "Editor",
    token: "demo-editor-token",
    scopes: ["records.read", "records.write"],
    description: "Read/write access for the scaffolded service.",
  },
];

export type ${options.contextTypeName} = {
  records: Array<{
    id: string;
    title: string;
    summary: string;
  }>;
};

export const ${options.serviceExportName} = defineAgentService<${options.contextTypeName}>({
  id: "${options.serviceId}",
  name: "${options.serviceName}",
  version: "0.1.0",
  description: "${options.description}",
  auth: {
    kind: "bearer",
    description: "Demo bearer auth for the scaffolded service.",
    cliSetup: {
      instructions: "Use --profile editor for read/write access or --profile reader for read-only access.",
      profiles: profiles.map((profile) => ({
        id: profile.id,
        label: profile.label,
        token: profile.token,
        description: profile.description,
      })),
    },
    verifyToken: (token) => {
      const profile = profiles.find((candidate) => candidate.token === token);
      if (!profile) {
        return null;
      }

      return {
        actorId: profile.id,
        scopes: profile.scopes,
      };
    },
  },
  operations: {
    list_records: {
      title: "List Records",
      description: "List records visible to the authenticated caller.",
      input: z.object({
        query: z.string().optional(),
      }),
      output: z.object({
        results: z.array(z.object({
          id: z.string(),
          title: z.string(),
          summary: z.string(),
        })),
      }),
      scopes: ["records.read"],
      handler: ({ serviceContext }, input) => {
        const query = input.query?.toLowerCase();
        const results = serviceContext.records.filter((record) => (
          !query
          || record.title.toLowerCase().includes(query)
          || record.summary.toLowerCase().includes(query)
        ));

        return { results };
      },
    },
    save_record: {
      title: "Save Record",
      description: "Create a new record in the scaffolded service store.",
      input: z.object({
        title: z.string().min(1),
        summary: z.string().min(1),
      }),
      output: z.object({
        ok: z.boolean(),
        recordCount: z.number(),
      }),
      scopes: ["records.write"],
      surfaces: {
        rest: {
          method: "POST",
        },
      },
      handler: ({ serviceContext }, input) => {
        serviceContext.records.push({
          id: \`rec_\${serviceContext.records.length + 1}\`,
          ...input,
        });

        return {
          ok: true,
          recordCount: serviceContext.records.length,
        };
      },
    },
  },
});

export function ${options.contextFactoryName}(): ${options.contextTypeName} {
  return {
    records: [
      {
        id: "rec_1",
        title: "Scaffold Auth Record",
        summary: "Used to validate the bearer template end to end.",
      },
    ],
  };
}
`;
}
function runtimeFileContent(options) {
  return `import { createNodeServiceRuntime } from "agent-service-sdk";

import { ${options.contextFactoryName}, ${options.serviceExportName} } from "${options.importPath}";

const context = ${options.contextFactoryName}();

const runtime = createNodeServiceRuntime(${options.serviceExportName}, {
  createContext: () => context,
  port: ${options.port},
  stdioCommand: "pnpm mcp",
  installCommand: ({ origin }) => \`pnpm cli setup --origin \${origin}${options.template === "bearer" ? " --profile editor" : ""}\`,
${options.template === "bearer" ? '  resolveStdioToken: () => "demo-editor-token",' : ""}
});

await runtime.run(process.argv);
`;
}
function readmeContent(options) {
  return `# ${options.serviceName}

Generated with \`agent-service-sdk init\`.

## Start

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## Agent Setup

Tell an agent:

\`\`\`text
See http://127.0.0.1:${options.port}, set it up, and start using it.
\`\`\`

## CLI

\`\`\`bash
pnpm cli setup --origin http://127.0.0.1:${options.port}${options.template === "bearer" ? " --profile editor" : ""}
pnpm cli status --json
pnpm cli ${options.template === "bearer" ? "list-records" : "search-records"} --query metrics --json
\`\`\`

## Local MCP

\`\`\`bash
pnpm mcp
\`\`\`

${options.template === "bearer" ? `## Demo Tokens

- \`reader\` -> \`demo-reader-token\`
- \`editor\` -> \`demo-editor-token\`
` : ""}
`;
}
async function scaffoldServiceProject(options) {
  const targetDir = resolve(options.targetDir);
  const serviceId = options.serviceId;
  const serviceName = options.serviceName ?? titleCaseFromSlug(serviceId);
  const description = options.description ?? `${serviceName} service exposed to agent surfaces through agent-service-sdk.`;
  const packageName = `${serviceId}-service`;
  const sdkDependency = options.sdkDependency ?? "^0.1.0";
  const port = options.port ?? 4010;
  const template = options.template ?? "basic";
  const serviceVarName = `${camelCase(serviceId)}Service`;
  const contextTypeName = `${titleCaseFromSlug(serviceId).replace(/\s+/g, "")}Context`;
  const contextFactoryName = `create${titleCaseFromSlug(serviceId).replace(/\s+/g, "")}Context`;
  await ensureEmptyDirectory(targetDir);
  await mkdir(join(targetDir, "src"), { recursive: true });
  await Promise.all([
    writeFile(join(targetDir, "package.json"), packageJsonContent({
      packageName,
      description,
      sdkDependency
    })),
    writeFile(join(targetDir, "tsconfig.json"), tsconfigContent()),
    writeFile(join(targetDir, ".gitignore"), "node_modules\n"),
    writeFile(join(targetDir, "README.md"), readmeContent({
      serviceName,
      port,
      template
    })),
    writeFile(
      join(targetDir, "src", "service.ts"),
      template === "bearer" ? bearerServiceFileContent({
        serviceId,
        serviceName,
        description,
        contextTypeName,
        serviceExportName: serviceVarName,
        contextFactoryName
      }) : basicServiceFileContent({
        serviceId,
        serviceName,
        description,
        contextTypeName,
        serviceExportName: serviceVarName,
        contextFactoryName
      })
    ),
    writeFile(join(targetDir, "src", "runtime.ts"), runtimeFileContent({
      serviceExportName: serviceVarName,
      contextFactoryName,
      importPath: "./service.js",
      template,
      port
    }))
  ]);
  return {
    targetDir,
    serviceId,
    serviceName,
    packageName,
    port,
    template
  };
}

export {
  scaffoldServiceProject
};
//# sourceMappingURL=chunk-JDZJWCNB.js.map