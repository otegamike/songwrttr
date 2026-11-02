#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SongPadClient } from "./client.js";
import { loadConfig } from "./config.js";
import { buildToolHandlers, registerTools } from "./tools.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new SongPadClient({
    baseUrl: config.baseUrl,
    token: config.token,
  });
  const server = new McpServer({
    name: "songpad",
    version: "0.1.0",
  });

  registerTools(
    server,
    buildToolHandlers(client, {
      maxInstrumentalMb: config.maxInstrumentalMb,
    }),
  );

  await server.connect(new StdioServerTransport());
  console.error("SongPad MCP server ready on stdio");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`SongPad MCP server failed: ${message}`);
  process.exit(1);
});
