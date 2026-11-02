# ADR 0002: npm workspaces for the app and MCP server

## Status

Accepted.

## Context

The Next.js app lives at the repository root. Phase 5 adds a standalone stdio MCP server
with its own `package.json` and TypeScript build.

## Decision

Use npm workspaces with the root package as the app and `mcp/` as a workspace package.
The MCP package keeps its own `tsconfig.json` and builds to `mcp/dist/`, so it can be
registered in an MCP client independently.

## Consequences

- One `npm install`, shared tooling and lockfile.
- The root `tsconfig.json` excludes `mcp/`; the MCP package has its own typecheck/build.
- The MCP server never imports application source; it only talks HTTP.
