import type { AgentServiceDefinition } from "../types.js";
import { describeOperations, getBinaryName } from "../service.js";

export function renderLlmsTxt<TServiceContext>(
  service: AgentServiceDefinition<TServiceContext>,
  options: { origin: string; installCommand?: string; stdioCommand?: string },
): string {
  const binaryName = getBinaryName(service);
  const operations = describeOperations(service);
  const setupCommand = options.installCommand ?? `${binaryName} setup --origin ${options.origin}`;
  const authProfiles = service.auth?.kind === "bearer"
    ? service.auth.cliSetup?.profiles ?? []
    : [];

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
${service.auth?.kind === "bearer"
  ? `- Instructions: ${service.auth.cliSetup?.instructions ?? "Provide a bearer token or use a configured profile."}
- Remote clients must send Authorization: Bearer <token>
${authProfiles.map((profile) => `- Profile ${profile.id}: ${profile.label}${profile.description ? ` (${profile.description})` : ""}`).join("\n")}`
  : "- No authentication required"}

## Operations

${operations.map((operation) => `- ${operation.key}: ${operation.description} [${operation.rest.method} ${operation.rest.path}] [tool ${operation.mcp.toolName}]${operation.scopes.length > 0 ? ` [scopes: ${operation.scopes.join(", ")}]` : ""}`).join("\n")}
`;
}
