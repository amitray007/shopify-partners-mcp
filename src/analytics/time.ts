export const DAY_MS = 86_400_000;

export interface Range {
  from: number;
  to: number;
}

export function monthKey(at: number): string {
  return new Date(at).toISOString().slice(0, 7);
}

export function monthStart(key: string): number {
  return Date.parse(`${key}-01T00:00:00Z`);
}

function nextMonthStart(key: string): number {
  const start = new Date(monthStart(key));
  return Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
}

// The moment a month is measured: its last millisecond, or now for the current month.
export function snapshotAt(key: string, now: number): number {
  return Math.min(nextMonthStart(key) - 1, now);
}

// The last `count` calendar months, oldest first, ending with the current month.
export function recentMonths(now: number, count: number): string[] {
  const current = new Date(now);
  return Array.from({ length: count }, (_, index) =>
    monthKey(
      Date.UTC(
        current.getUTCFullYear(),
        current.getUTCMonth() - (count - 1 - index),
        1
      )
    )
  );
}

export function previousMonth(key: string): string {
  return monthKey(monthStart(key) - 1);
}

export function inRange(iso: string | null | undefined, range: Range): boolean {
  if (!iso) {
    return false;
  }
  const at = Date.parse(iso);
  return at >= range.from && at <= range.to;
}

export function daysBetween(from: string, to: number): number {
  return Math.round((to - Date.parse(from)) / DAY_MS);
}

export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function percent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 1000) / 10;
}
