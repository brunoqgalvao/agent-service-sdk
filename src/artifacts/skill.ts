import type { AgentServiceDefinition } from "../types.js";
import { describeOperations } from "../service.js";
import { getBinaryName } from "../service.js";

export function renderSkill<TServiceContext>(
  service: AgentServiceDefinition<TServiceContext>,
  options: { origin: string; installCommand?: string; stdioCommand?: string },
): string {
  const binaryName = getBinaryName(service);
  const operations = describeOperations(service);
  const installCommand = options.installCommand ?? `${binaryName} setup --origin ${options.origin}`;

  const commandTable = operations
    .map((operation) => `| \`${binaryName} ${operation.cli.command}\` | ${operation.cli.description} |`)
    .join("\n");

  const toolList = operations
    .map((operation) => `- \`${operation.mcp.toolName}\` — ${operation.mcp.description}`)
    .join("\n");

  const authProfiles = service.auth?.kind === "bearer"
    ? service.auth.cliSetup?.profiles ?? []
    : [];
  const authSection = service.auth?.kind === "bearer"
    ? `## Authentication

${service.auth.description ?? "This service requires bearer authentication."}

${service.auth.cliSetup?.instructions ?? "Provide a bearer token directly or use one of the named setup profiles."}

${authProfiles.length === 0
  ? ""
  : `### Profiles

${authProfiles.map((profile) => `- \`${profile.id}\` — ${profile.label}${profile.description ? ` (${profile.description})` : ""}`).join("\n")}
`}
- REST / OpenAPI / Remote MCP requests must send \`Authorization: Bearer <token>\`.
`
    : "";

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

${options.stdioCommand
  ? `\`\`\`bash
${options.stdioCommand}
\`\`\`
`
  : ""}

| Command | Description |
|---------|-------------|
| \`${binaryName} setup\` | Store service origin${service.auth?.kind === "bearer" ? " and authentication token/profile" : ""} |
| \`${binaryName} status\` | Check service connectivity |
${commandTable}

${authSection}
## For Agents Without Terminal Access

- Remote MCP endpoint: \`${options.origin}/mcp\`
- OpenAPI spec: \`${options.origin}/v1/openapi.json\`
- REST base: \`${options.origin}${service.basePath ?? "/api/agent"}\`

## MCP Tools

${toolList}
`;
}
