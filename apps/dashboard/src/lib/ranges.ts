const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type RangeKey = "24h" | "7d" | "30d" | "90d";

type RangeDef = {
  /** Human label for headers ("Last 7 days"). */
  label: string;
  /** Short label for the delta line ("vs prior 7d"). */
  short: string;
  ms: number;
  /** Rollup interval to query — hourly buckets only make sense for one day. */
  interval: "hour" | "day";
};

// getOverview zero-fills every bucket between from and to, so ranges are
// bounded presets rather than an unbounded "all time" (from: 0 would build
// ~20k empty buckets server-side).
export const RANGES: Record<RangeKey, RangeDef> = {
  "24h": { label: "Last 24 hours", short: "24h", ms: 24 * HOUR_MS, interval: "hour" },
  "7d": { label: "Last 7 days", short: "7d", ms: 7 * DAY_MS, interval: "day" },
  "30d": { label: "Last 30 days", short: "30d", ms: 30 * DAY_MS, interval: "day" },
  "90d": { label: "Last 90 days", short: "90d", ms: 90 * DAY_MS, interval: "day" },
};

export const RANGE_KEYS: RangeKey[] = ["24h", "7d", "30d", "90d"];

export const DEFAULT_RANGE: RangeKey = "30d";
