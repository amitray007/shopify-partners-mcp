import type { McpServer } from "@modelcontextprotocol/server";

import { registerAnalyticsTools } from "./analytics.ts";
import { registerRawTools } from "./raw.ts";
import type { ToolContext } from "./shared.ts";

export function registerTools(server: McpServer, context: ToolContext): void {
  registerAnalyticsTools(server, context);
  registerRawTools(server, context);
}
