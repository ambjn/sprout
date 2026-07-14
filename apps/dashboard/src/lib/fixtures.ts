import type { DashboardData } from "./types";

// Realistic demo data matching the exact shapes getOverview/getSessions/
// getIssues return, so the UI can be built and viewed correctly before a
// live Convex deployment is wired up.
export function buildFixtures(): DashboardData {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const minute = 60 * 1000;

  const series = Array.from({ length: 24 }, (_, i) => {
    const hourOfDay = (now - (23 - i) * hour) / hour;
    const wave = Math.sin((hourOfDay / 24) * Math.PI * 2 - 1.2) * 18 + 22;
    const noise = (i * 37) % 11;
    return {
      bucketStart: now - (23 - i) * hour,
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
        { name: "/discover", count: 402 },
        { name: "/", count: 298 },
        { name: "/settings", count: 133 },
        { name: "/grov/[id]", count: 512 },
        { name: "/profile/[clerkId]", count: 87 },
      ],
    },
    previousTotals: {
      events: Math.round(totalEvents * 0.86),
      sessions: 189,
      errors: 4,
    },
    sessions: [
      {
        _id: "s1",
        sessionId: "9f2c1a-...-e4b1",
        entryScreen: "/discover",
        exitScreen: "/grov/[id]",
        eventCount: 14,
        errorCount: 0,
        startedAt: now - 4 * minute,
        endedAt: now - 1 * minute,
        identifiedUserId: "user_8sk2n",
        context: {
          appVersion: "2.4.2",
          buildNumber: "142",
          osName: "iOS",
          osVersion: "17.4",
          deviceModel: "iPhone15,3",
        },
      },
      {
        _id: "s2",
        sessionId: "7b0a3e-...-2c9d",
        entryScreen: "/",
        exitScreen: "/settings",
        eventCount: 6,
        errorCount: 1,
        startedAt: now - 22 * minute,
        endedAt: now - 20 * minute,
        context: {
          appVersion: "2.4.2",
          buildNumber: "142",
          osName: "Android",
          osVersion: "14",
          deviceModel: "Pixel 8",
        },
      },
      {
        _id: "s3",
        sessionId: "4d8f61-...-a710",
        entryScreen: "/discover",
        exitScreen: "/discover",
        eventCount: 22,
        errorCount: 0,
        startedAt: now - 55 * minute,
        endedAt: now - 40 * minute,
        identifiedUserId: "user_2mfa9",
        context: {
          appVersion: "2.4.1",
          buildNumber: "138",
          osName: "iOS",
          osVersion: "17.2",
          deviceModel: "iPhone14,5",
        },
      },
      {
        _id: "s4",
        sessionId: "c391be-...-77f2",
        entryScreen: "/grov/[id]",
        exitScreen: "/grov/[id]",
        eventCount: 9,
        errorCount: 0,
        startedAt: now - 2 * hour,
        endedAt: now - 2 * hour + 6 * minute,
        context: {
          appVersion: "2.4.2",
          buildNumber: "142",
          osName: "Android",
          osVersion: "13",
          deviceModel: "SM-S911U",
        },
      },
      {
        _id: "s5",
        sessionId: "12ab90-...-5f3c",
        entryScreen: "/discover",
        exitScreen: "/profile/[clerkId]",
        eventCount: 11,
        errorCount: 0,
        startedAt: now - 3 * hour,
        endedAt: now - 3 * hour + 8 * minute,
        identifiedUserId: "user_71qzz",
        context: {
          appVersion: "2.4.1",
          buildNumber: "138",
          osName: "iOS",
          osVersion: "17.4",
          deviceModel: "iPhone15,3",
        },
      },
      {
        _id: "s6",
        sessionId: "e02f77-...-90ad",
        entryScreen: "/",
        exitScreen: "/discover",
        eventCount: 4,
        errorCount: 1,
        startedAt: now - 5 * hour,
        endedAt: now - 5 * hour + 2 * minute,
        context: {
          appVersion: "2.4.2",
          buildNumber: "142",
          osName: "Android",
          osVersion: "14",
          deviceModel: "Pixel 8 Pro",
        },
      },
    ],
    issues: [
      {
        fingerprint: "a1b2c3",
        title: "TypeError: Cannot read property 'foo' of undefined",
        errorType: "TypeError",
        sampleMessage: "Cannot read property 'foo' of undefined",
        occurrenceCount: 12,
        affectedSessionCount: 9,
        firstSeenAt: now - 3 * 24 * hour,
        lastSeenAt: now - 18 * minute,
        status: "open",
      },
      {
        fingerprint: "d4e5f6",
        title: "Error: Network request failed",
        errorType: "Error",
        sampleMessage: "Network request failed",
        occurrenceCount: 4,
        affectedSessionCount: 4,
        firstSeenAt: now - 8 * hour,
        lastSeenAt: now - 3 * hour,
        status: "open",
      },
      {
        fingerprint: "g7h8i9",
        title: "RangeError: Maximum call stack size exceeded",
        errorType: "RangeError",
        sampleMessage: "Maximum call stack size exceeded",
        occurrenceCount: 1,
        affectedSessionCount: 1,
        firstSeenAt: now - 26 * hour,
        lastSeenAt: now - 26 * hour,
        status: "resolved",
      },
      {
        fingerprint: "j0k1l2",
        title: "Error: WebSocket closed before connection established",
        errorType: "Error",
        sampleMessage: "WebSocket closed before connection established",
        occurrenceCount: 3,
        affectedSessionCount: 2,
        firstSeenAt: now - 5 * 24 * hour,
        lastSeenAt: now - 2 * 24 * hour,
        status: "ignored",
      },
    ],
  };
}
