import { setTimeout as delay } from "node:timers/promises";

import type { Config } from "./config.ts";

// Shopify allows four requests per second per Partner API client.
const MIN_INTERVAL_MS = 250;
const MAX_RETRIES = 3;

type Variables = Record<string, unknown>;
export type PartnerRequest = <T>(
  query: string,
  variables?: Variables
) => Promise<T>;

export interface ClientDeps {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

const defaultDeps: ClientDeps = {
  fetch: globalThis.fetch,
  sleep: (ms) => delay(ms),
  now: Date.now,
};

export class PartnerApiError extends Error {
  override name = "PartnerApiError";
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export function createPartnerClient(
  config: Pick<Config, "endpoint" | "accessToken">,
  deps: ClientDeps = defaultDeps
): PartnerRequest {
  const waitForSlot = createThrottle(deps);

  async function send(
    query: string,
    variables: Variables | undefined,
    attempt: number
  ) {
    await waitForSlot();
    const response = await deps.fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": config.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (response.status === 429 && attempt < MAX_RETRIES) {
      await deps.sleep(retryDelayMs(response, attempt));
      return send(query, variables, attempt + 1);
    }
    return response;
  }

  return async <T>(query: string, variables?: Variables): Promise<T> => {
    const response = await send(query, variables, 0);
    if (!response.ok) {
      throw new PartnerApiError(describeStatus(response.status));
    }
    return readData<T>((await response.json()) as GraphqlResponse<T>);
  };
}

function createThrottle({ sleep, now }: ClientDeps): () => Promise<void> {
  let nextSlot = 0;
  return async () => {
    const start = Math.max(now(), nextSlot);
    nextSlot = start + MIN_INTERVAL_MS;
    const wait = start - now();
    if (wait > 0) {
      await sleep(wait);
    }
  };
}

function describeStatus(status: number): string {
  if (status === 401) {
    return "Partner API returned HTTP 401: the access token is wrong or was revoked";
  }
  if (status === 403 || status === 404) {
    return `Partner API returned HTTP ${status}: check SHOPIFY_PARTNER_ID is the Partner Dashboard number and the client has the needed permission`;
  }
  return `Partner API returned HTTP ${status}`;
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("Retry-After"));
  return retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
}

function readData<T>(body: GraphqlResponse<T>): T {
  if (body.errors?.length) {
    throw new PartnerApiError(
      body.errors.map((error) => error.message).join("; ")
    );
  }
  if (body.data === undefined) {
    throw new PartnerApiError("Partner API returned no data");
  }
  return body.data;
}
