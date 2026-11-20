import { z } from "zod";

import type { PartnerRequest } from "../client.ts";
import type { LoadHistory } from "../history.ts";
import { MAX_PAGE_SIZE } from "../partner.ts";
import type { Partner } from "../partner.ts";

export interface ToolContext {
  partner: Partner;
  request: PartnerRequest;
  loadHistory: LoadHistory;
  appIds: string[];
  now: () => number;
}

export const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

export const id = (what: string) =>
  z.string().describe(`${what} ID: the number or a gid:// ID`);

export const dateTime = (what: string) =>
  z.iso.datetime({ offset: true }).describe(what);

export const page = {
  first: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .optional()
    .describe("Page size, default 100"),
  after: z.string().optional().describe("nextCursor from the previous page"),
};

export const appIdInput = id("App")
  .optional()
  .describe(
    "App ID: the number or a gid:// ID. Optional when SHOPIFY_PARTNER_APP_IDS names exactly one app"
  );

export function resolveAppId(
  appId: string | undefined,
  appIds: string[]
): string {
  const resolved = appId ?? (appIds.length === 1 ? appIds[0] : undefined);
  if (!resolved) {
    throw new Error(
      appIds.length === 0
        ? "Pass appId, or set SHOPIFY_PARTNER_APP_IDS"
        : `Pass appId. Configured apps: ${appIds.join(", ")}`
    );
  }
  return resolved;
}

export function respondWith(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

export async function respond(result: Promise<unknown>) {
  return respondWith(await result);
}
