export interface Connection<T> {
  pageInfo: { hasNextPage: boolean };
  edges: { cursor: string; node: T }[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function toPage<T>(connection: Connection<T>): Page<T> {
  const last = connection.edges.at(-1);
  return {
    items: connection.edges.map((edge) => edge.node),
    nextCursor: connection.pageInfo.hasNextPage && last ? last.cursor : null,
  };
}

export async function collectPages<T>(
  fetchPage: (after: string | undefined) => Promise<Page<T>>,
  maxPages: number
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    // Each page needs the cursor from the one before it.
    // oxlint-disable-next-line no-await-in-loop
    const result = await fetchPage(after);
    items.push(...result.items);
    if (result.nextCursor === null) {
      return { items, truncated: false };
    }
    after = result.nextCursor;
  }
  return { items, truncated: true };
}
