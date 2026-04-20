# Agent Service SDK

`agent-service-sdk` lets a developer define one service contract and publish it to the agent-facing surfaces that matter:

- REST
- OpenAPI
- remote MCP over HTTP
- local stdio MCP
- CLI
- generated `SKILL.md`
- generated `llms.txt`

The service author focuses on business logic, auth verification, and input/output schemas. The SDK handles the agent onboarding layer.

## What The SDK Owns

- route generation
- OpenAPI generation
- MCP tool registration
- CLI generation from schemas
- generated setup docs for agents
- auth propagation across surfaces
- scope enforcement
- output validation

## What The Service Author Owns

- service metadata (`id`, `name`, `description`, `version`)
- operation schemas and handlers
- auth verification logic
- service-specific state, API calls, and business rules

## Quick Start

For a new service repo, start with the scaffold:

```bash
agent-service-sdk init \
  --dir ./my-agent-service \
  --service-id my-agent-service \
  --name "My Agent Service"
```

That generates a ready-to-run TypeScript project with:

- `src/service.ts`
- `src/runtime.ts`
- `package.json`
- `tsconfig.json`
- `README.md`

Available templates:

- `basic` for an unauthenticated starter
- `bearer` for a starter with demo profiles, scopes, and auth wiring

If you already have a repo, install the package directly:

```bash
pnpm add github:brunoqgalvao/agent-service-sdk zod
```

Define the service once:

```ts
import { z } from "zod";
import { defineAgentService } from "agent-service-sdk";

type MovieContext = {
  movies: Array<{
    id: string;
    title: string;
    mood: string;
  }>;
};

export const movieService = defineAgentService<MovieContext>({
  id: "movie-night",
  name: "Movie Night Planner",
  version: "0.1.0",
  description: "Recommendations, watchlists, and planning.",
  operations: {
    search_movies: {
      description: "Search the catalog.",
      input: z.object({
        query: z.string().default(""),
        mood: z.string().optional(),
      }),
      output: z.object({
        results: z.array(z.object({
          id: z.string(),
          title: z.string(),
          mood: z.string(),
        })),
      }),
      handler: ({ serviceContext }, input) => ({
        results: serviceContext.movies.filter((movie) => {
          const queryMatch = !input.query || movie.title.toLowerCase().includes(input.query.toLowerCase());
          const moodMatch = !input.mood || movie.mood === input.mood;
          return queryMatch && moodMatch;
        }),
      }),
    },
  },
});
```

Mount every surface from one runtime entrypoint:

```ts
import { createNodeServiceRuntime } from "agent-service-sdk";

import { movieService } from "./service.js";

const context = {
  movies: [{ id: "mv_1", title: "Sunday in Lisbon", mood: "warm" }],
};

const runtime = createNodeServiceRuntime(movieService, {
  createContext: () => context,
  stdioCommand: "pnpm mcp",
  installCommand: ({ origin }) => `pnpm cli setup --origin ${origin}`,
});

await runtime.run(process.argv);
```

Then wire your package scripts to the single runtime file:

```json
{
  "scripts": {
    "dev": "tsx src/runtime.ts serve",
    "cli": "tsx src/runtime.ts cli",
    "mcp": "tsx src/runtime.ts mcp"
  }
}
```

With that in place, one file drives HTTP serving, CLI execution, and stdio MCP.

## Generated Surface Contract

Once mounted, the service gets:

- `GET /health`
- `GET /v1/capabilities`
- `GET /v1/status`
- `GET /v1/openapi.json`
- `GET /artifacts/skill.md`
- `GET /llms.txt`
- `POST /mcp`
- REST operation routes under `/api/agent/*` by default

Read-style operations with flat scalar inputs default to `GET`. Write operations stay explicit via `POST`, `PUT`, `PATCH`, or `DELETE`.

## Authentication

Current built-in auth modes:

- `none`
- `bearer`

With bearer auth, the SDK:

- validates tokens on REST and remote MCP requests
- propagates auth identity into handlers
- enforces per-operation scopes
- exposes CLI setup profiles for local/demo workflows
- includes auth guidance in generated `SKILL.md` and `llms.txt`

Example:

```ts
auth: {
  kind: "bearer",
  description: "Warehouse bearer tokens.",
  cliSetup: {
    instructions: "Use --profile east-ops or pass --token directly.",
    profiles: [
      {
        id: "east-ops",
        label: "East Operations",
        token: "demo-east-token",
        description: "Read/write east warehouse access.",
      },
    ],
  },
  verifyToken: async (token) => {
    if (token !== "demo-east-token") {
      return null;
    }

    return {
      actorId: "east-ops",
      profileId: "east",
      scopes: ["inventory.read", "inventory.write"],
    };
  },
}
```

## Demos

The companion examples repo is public here:

- [agent-service-demos](https://github.com/brunoqgalvao/agent-service-demos)

It includes:

- `movie-night` for search + mutable shared state
- `warehouse-insights` for bearer auth + scope enforcement
- `travel-concierge` for lightweight data-service patterns

The demo validator boots every service and exercises REST, OpenAPI, CLI, stdio MCP, remote MCP, auth failures, and state parity.
