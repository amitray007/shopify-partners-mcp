#!/usr/bin/env node
import { createRequire } from "node:module";

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { createPartnerClient } from "./client.ts";
import { loadConfig } from "./config.ts";
import { createHistoryLoader } from "./history.ts";
import { INSTRUCTIONS } from "./instructions.ts";
import { createPartner } from "./partner.ts";
import { registerTools } from "./tools/index.ts";

const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};
const config = loadConfig(process.env);
const request = createPartnerClient(config);
const partner = createPartner(request);
const server = new McpServer(
  { name: "shopify-partners-mcp", version },
  { instructions: INSTRUCTIONS }
);

registerTools(server, {
  partner,
  request,
  loadHistory: createHistoryLoader(partner),
  appIds: config.appIds,
  now: Date.now,
});
await server.connect(new StdioServerTransport());
