import { z } from "zod";

const DEFAULT_API_VERSION = "2026-07";

const envSchema = z.object({
  SHOPIFY_PARTNER_ID: z
    .string()
    .regex(/^\d+$/u, "must be the number in your Partner Dashboard URL"),
  SHOPIFY_PARTNER_ACCESS_TOKEN: z.string().min(1),
  SHOPIFY_PARTNER_API_VERSION: z.string().default(DEFAULT_API_VERSION),
  SHOPIFY_PARTNER_APP_IDS: z.string().default(""),
});

export interface Config {
  endpoint: string;
  accessToken: string;
  appIds: string[];
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = envSchema.parse(env);
  return {
    endpoint: `https://partners.shopify.com/${parsed.SHOPIFY_PARTNER_ID}/api/${parsed.SHOPIFY_PARTNER_API_VERSION}/graphql.json`,
    accessToken: parsed.SHOPIFY_PARTNER_ACCESS_TOKEN,
    appIds: splitList(parsed.SHOPIFY_PARTNER_APP_IDS),
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
