#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";

import { createPartnerClient } from "./client.ts";
import { loadConfig } from "./config.ts";
import { createPartner } from "./partner.ts";
import { registerTools } from "./tools.ts";

const config = loadConfig(process.env);
const request = createPartnerClient(config);
const server = new McpServer({
  name: "shopify-partners-mcp",
  version: "0.1.0",
});

registerTools(server, {
  partner: createPartner(request),
  request,
  appIds: config.appIds,
});
await server.connect(new StdioServerTransport());
