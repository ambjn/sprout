import { RANGES, type RangeKey, DEFAULT_RANGE } from "./ranges";
import type { DashboardData, IssueRow, SessionRow } from "./types";

// Realistic demo data matching the exact shapes getOverview/getSessions/
// getIssues return, so the UI can be built and viewed correctly before a
// live Convex deployment is wired up. Deterministic (seeded) so the demo
// looks the same on every load.

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex(rand: () => number, length: number): string {
  return Array.from({ length }, () => "0123456789abcdef"[Math.floor(rand() * 16)]).join("");
}

function uuid(rand: () => number): string {
  return `${hex(rand, 8)}-${hex(rand, 4)}-4${hex(rand, 3)}-${hex(rand, 4)}-${hex(rand, 12)}`;
}

function clerkId(rand: () => number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789";
  return `user_2${Array.from({ length: 26 }, () => alphabet[Math.floor(rand() * alphabet.length)]).join("")}`;
}

const DEVICES = [
  { osName: "iOS", osVersion: "17.4", deviceModel: "iPhone15,3" },
  { osName: "iOS", osVersion: "17.2", deviceModel: "iPhone14,5" },
  { osName: "iOS", osVersion: "16.7", deviceModel: "iPhone12,1" },
  { osName: "iOS", osVersion: "17.4", deviceModel: "iPad13,4" },
  { osName: "Android", osVersion: "14", deviceModel: "Pixel 8" },
  { osName: "Android", osVersion: "14", deviceModel: "Pixel 8 Pro" },
  { osName: "Android", osVersion: "13", deviceModel: "SM-S911U" },
  { osName: "Android", osVersion: "14", deviceModel: "SM-S928B" },
];

const VERSIONS = [
  { appVersion: "2.4.2", buildNumber: "142" },
  { appVersion: "2.4.2", buildNumber: "142" },
  { appVersion: "2.4.1", buildNumber: "138" },
  { appVersion: "2.3.9", buildNumber: "131" },
];

const SCREENS = [
  "/",
  "/discover",
  "/settings",
  "/grov/[id]",
  "/profile/[clerkId]",
  "/search",
  "/notifications",
];

function buildSessions(now: number): SessionRow[] {
  const rand = mulberry32(20260715);
  const minute = 60 * 1000;
  return Array.from({ length: 30 }, (_, i) => {
    const startedAt = now - Math.round((rand() * 46 + i) * 60) * minute;
    const durationMs = Math.round((rand() * 24 + 0.5) * minute);
    const errorCount = rand() < 0.18 ? Math.ceil(rand() * 2) : 0;
    return {
      _id: `s${i + 1}`,
      sessionId: uuid(rand),
      entryScreen: SCREENS[Math.floor(rand() * SCREENS.length)],
      exitScreen: SCREENS[Math.floor(rand() * SCREENS.length)],
      eventCount: Math.ceil(rand() * 28) + errorCount,
      errorCount,
      startedAt,
      // A few sessions look still-open (killed app, no session_end yet).
      endedAt: rand() < 0.85 ? startedAt + durationMs : undefined,
      identifiedUserId: rand() < 0.6 ? clerkId(rand) : undefined,
      context: {
        ...DEVICES[Math.floor(rand() * DEVICES.length)],
        ...VERSIONS[Math.floor(rand() * VERSIONS.length)],
      },
    };
  }).sort((a, b) => b.startedAt - a.startedAt);
}

function buildIssues(now: number): IssueRow[] {
  const rand = mulberry32(982451653);
  const hour = 60 * 60 * 1000;
  const defs: [string, string, IssueRow["status"], number, number][] = [
    // [errorType, message, status, occurrences, affected sessions]
    ["TypeError", "Cannot read property 'foo' of undefined", "open", 12, 9],
    ["Error", "Network request failed", "open", 47, 31],
    ["TypeError", "null is not an object (evaluating 'route.params.id')", "open", 8, 6],
    ["Invariant Violation", "Text strings must be rendered within a <Text> component", "open", 5, 5],
    ["RangeError", "Maximum call stack size exceeded", "resolved", 1, 1],
    ["Error", "WebSocket closed before connection established", "ignored", 3, 2],
    ["SyntaxError", "JSON Parse error: Unexpected token '<'", "resolved", 6, 4],
    ["Error", "AsyncStorage: database or disk is full", "open", 2, 2],
    ["ReferenceError", "Property 'analytics' doesn't exist", "resolved", 9, 7],
  ];
  return defs
    .map(([errorType, message, status, occurrenceCount, affectedSessionCount]) => {
      const firstSeenAt = now - Math.round((rand() * 6 + 0.5) * 24 * hour);
      const lastSeenAt = firstSeenAt + Math.round(rand() * (now - firstSeenAt));
      return {
        fingerprint: hex(rand, 16),
        title: `${errorType}: ${message}`,
        errorType,
        sampleMessage: message,
        occurrenceCount,
        affectedSessionCount,
        firstSeenAt,
        lastSeenAt,
        status,
      };
    })
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export function buildFixtures(range: RangeKey = DEFAULT_RANGE): DashboardData {
  const now = Date.now();
  const hour = 60 * 60 * 1000;

  // One point per bucket of the selected range, same as getOverview returns.
  const { ms, interval } = RANGES[range];
  const bucketMs = interval === "hour" ? hour : 24 * hour;
  const bucketCount = Math.round(ms / bucketMs);
  const series = Array.from({ length: bucketCount }, (_, i) => {
    const t = now - (bucketCount - 1 - i) * bucketMs;
    const cycle = interval === "hour" ? t / (24 * hour) : t / (7 * 24 * hour);
    const scale = interval === "hour" ? 1 : 14;
    const wave = (Math.sin(cycle * Math.PI * 2 - 1.2) * 18 + 22) * scale;
    const noise = ((i * 37) % 11) * scale;
    return {
      bucketStart: t,
      count: Math.max(0, Math.round(wave + noise)),
    };
  });

  const totalEvents = series.reduce((a, b) => a + b.count, 0);

  return {
    isDemo: true,
    overview: {
      series,
      totals: {
        events: totalEvents,
        sessions: 214,
        errors: 7,
      },
      topEvents: [
        { name: "grov_created", count: 312 },
        { name: "grov_published", count: 188 },
        { name: "grov_liked", count: 156 },
        { name: "grov_remixed", count: 74 },
        { name: "follow_created", count: 41 },
      ],
      topScreens: [
        { name: "/grov/[id]", count: 512 },
        { name: "/discover", count: 402 },
        { name: "/", count: 298 },
        { name: "/settings", count: 133 },
        { name: "/profile/[clerkId]", count: 87 },
      ],
    },
    previousTotals: {
      events: Math.round(totalEvents * 0.86),
      sessions: 189,
      errors: 4,
    },
    sessions: buildSessions(now),
    issues: buildIssues(now),
  };
}
