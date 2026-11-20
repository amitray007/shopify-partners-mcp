#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { createPartnerClient } from "./client.ts";
import { loadConfig } from "./config.ts";
import { createHistoryLoader } from "./history.ts";
import { INSTRUCTIONS } from "./instructions.ts";
import { createPartner } from "./partner.ts";
import { registerTools } from "./tools/index.ts";

const config = loadConfig(process.env);
const request = createPartnerClient(config);
const partner = createPartner(request);
const server = new McpServer(
  { name: "shopify-partners-mcp", version: "0.1.0" },
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
