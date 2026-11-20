// The older Partner API fields (app, transactions) take gid://partners/... IDs. The newer ones
// (events, activeSubscription) take gid://shopify/... IDs for the same app or shop.
export type GidNamespace = "partners" | "shopify";
export type GidKind = "App" | "Shop";

export function toGid(
  kind: GidKind,
  id: string,
  namespace: GidNamespace
): string {
  const match = new RegExp(
    `^(?:gid://(?:partners|shopify)/${kind}/)?(?<number>\\d+)$`,
    "u"
  ).exec(id.trim());
  const number = match?.groups?.number;
  if (!number) {
    throw new Error(
      `Expected a numeric ${kind} ID or a ${kind} GID, got "${id}"`
    );
  }
  return `gid://${namespace}/${kind}/${number}`;
}

export function toOptionalGid(
  kind: GidKind,
  id: string | undefined,
  namespace: GidNamespace
): string | undefined {
  return id === undefined ? undefined : toGid(kind, id, namespace);
}
