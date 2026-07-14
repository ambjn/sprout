export type OverviewData = {
  series: { bucketStart: number; count: number }[];
  totals: { events: number; sessions: number; errors: number };
  topEvents: { name: string; count: number }[];
  topScreens: { name: string; count: number }[];
};

export type SessionContext = {
  appVersion?: string;
  buildNumber?: string;
  osName?: string;
  osVersion?: string;
  deviceModel?: string;
};

export type SessionRow = {
  _id: string;
  sessionId: string;
  entryScreen?: string;
  exitScreen?: string;
  eventCount: number;
  errorCount: number;
  startedAt: number;
  endedAt?: number;
  identifiedUserId?: string;
  context?: SessionContext;
};

export type IssueRow = {
  fingerprint: string;
  title: string;
  errorType: string;
  sampleMessage?: string;
  occurrenceCount: number;
  affectedSessionCount: number;
  firstSeenAt?: number;
  lastSeenAt: number;
  status: "open" | "resolved" | "ignored";
};

export type PeriodTotals = { events: number; sessions: number; errors: number };

export type DashboardData = {
  overview: OverviewData;
  previousTotals?: PeriodTotals;
  sessions: SessionRow[];
  issues: IssueRow[];
  isDemo: boolean;
};
