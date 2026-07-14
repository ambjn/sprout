import { useCallback, useEffect, useState } from "react";
import { getDashboardData, updateIssueStatus } from "@/lib/data";
import { computeDelta } from "@/lib/format";
import { RANGES, type RangeKey, DEFAULT_RANGE } from "@/lib/ranges";
import { StatTile } from "@/components/StatTile";
import { EventsChart } from "@/components/EventsChart";
import { DonutChart } from "@/components/DonutChart";
import { RankedList } from "@/components/RankedList";
import { RangePicker } from "@/components/RangePicker";
import { IssuesTable } from "@/components/IssuesTable";
import { SessionsTable } from "@/components/SessionsTable";
import { STATUS_META } from "@/components/StatusSelect";
import type { DashboardData, IssueRow } from "@/lib/types";

const PAGE = "max-w-[1200px] mx-auto px-6 pt-8 pb-16";

function SectionHeading({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3 mt-3 -mb-1">
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary m-0 shrink-0">
        {children}
      </h2>
      <div className="flex-1 h-px bg-gridline" />
    </div>
  );
}

function countBy<T>(items: T[], key: (item: T) => string): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function App() {
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDashboardData(range).then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [range]);

  // Optimistic: the row (and the "Issues by status" donut, derived from the
  // same state) update immediately; a failed write reverts to the old status.
  const handleIssueStatusChange = useCallback(
    (fingerprint: string, status: IssueRow["status"]) => {
      let previous: IssueRow["status"] | undefined;
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          issues: current.issues.map((issue) => {
            if (issue.fingerprint !== fingerprint) return issue;
            previous = issue.status;
            return { ...issue, status };
          }),
        };
      });
      void updateIssueStatus(fingerprint, status).then((ok) => {
        if (ok || previous === undefined) return;
        const revertTo = previous;
        setData((current) => {
          if (!current) return current;
          return {
            ...current,
            issues: current.issues.map((issue) =>
              issue.fingerprint === fingerprint ? { ...issue, status: revertTo } : issue,
            ),
          };
        });
      });
    },
    [],
  );

  const rangeDef = RANGES[range];

  if (!data) {
    return <main className={PAGE} />;
  }

  const { overview, previousTotals, sessions, issues, isDemo } = data;

  const eventsDelta = previousTotals
    ? computeDelta(overview.totals.events, previousTotals.events, "up", rangeDef.short)
    : null;
  const sessionsDelta = previousTotals
    ? computeDelta(overview.totals.sessions, previousTotals.sessions, "up", rangeDef.short)
    : null;

  const crashFreePct =
    sessions.length > 0
      ? `${((sessions.filter((s) => s.errorCount === 0).length / sessions.length) * 100).toFixed(1)}%`
      : "—";

  const issueStatuses: IssueRow["status"][] = ["open", "resolved", "ignored"];
  const issueStatusSegments = issueStatuses.map((status) => ({
    label: STATUS_META[status].label,
    value: issues.filter((i) => i.status === status).length,
    color: STATUS_META[status].color,
  }));

  const platformRows = countBy(sessions, (s) => s.context?.osName ?? "Unknown");
  const versionRows = countBy(
    sessions,
    (s) => (s.context?.appVersion ? `v${s.context.appVersion}` : "Unknown"),
  );

  const platformColors = [
    "var(--color-series-1)",
    "var(--color-series-2)",
    "var(--color-series-3)",
    "var(--color-series-4)",
  ];
  const platformSegments = platformRows.map((row, i) => ({
    label: row.name,
    value: row.count,
    color: platformColors[i % platformColors.length],
  }));

  return (
    <main className={PAGE}>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <img src="./logo_transparent.png" alt="Sprout" className="h-16 w-auto" />
          <p className="text-[15px] text-text-primary mt-2.5">
            Insights on how your app is used, with none of the infra.
          </p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            {[
              "No ingestion service to run",
              "No database to provision",
              "No SLA to babysit",
            ].map((point) => (
              <span
                key={point}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-1 px-2.5 py-1 text-xs text-text-secondary"
              >
                <span aria-hidden className="text-status-good font-semibold">
                  ✓
                </span>
                {point}
              </span>
            ))}
          </div>
        </div>
        {/* items-start + optical nudge: level with the logo row, not centered
            against the whole tagline/chips block. */}
        <div className="mt-3.5">
          <RangePicker value={range} onChange={setRange} />
        </div>
      </div>

      {isDemo && (
        <div className="bg-surface-1 border border-line border-l-[3px] border-l-status-warning rounded-lg py-2.5 px-3.5 text-[13px] text-text-secondary mb-6">
          Showing demo data — set <code className="font-mono">VITE_CONVEX_URL</code> and{" "}
          <code className="font-mono">VITE_SPROUT_DASHBOARD_KEY</code> in <code className="font-mono">.env</code> to connect
          to a real deployment.
        </div>
      )}

      {/* Refetch keeps the frame: previous render stays up, dimmed, while the
          new range loads -- no skeleton, no layout jump. */}
      <div
        className={`flex flex-col gap-4 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}
      >
        <div className="grid grid-cols-4 gap-4 mb-4 max-[900px]:grid-cols-2 max-[720px]:grid-cols-1">
          <StatTile label="Events" value={overview.totals.events} delta={eventsDelta} />
          <StatTile label="Sessions" value={overview.totals.sessions} delta={sessionsDelta} />
          <StatTile label="Errors" value={overview.totals.errors} />
          <StatTile label="Crash-free sessions" value={crashFreePct} />
        </div>

        <SectionHeading>Trends</SectionHeading>
        <div className="grid grid-cols-[2fr_1fr] gap-4 mb-4 items-stretch max-[900px]:grid-cols-1">
          <EventsChart
            series={overview.series}
            subtitle={rangeDef.label.toLowerCase()}
            interval={rangeDef.interval}
          />
          <DonutChart
            title="Issues by status"
            subtitle={`${issues.length} tracked`}
            segments={issueStatusSegments}
            centerLabel={String(issues.length)}
          />
        </div>

        <SectionHeading>Breakdown</SectionHeading>
        <div className="grid grid-cols-2 gap-4 mb-4 items-stretch max-[720px]:grid-cols-1">
          <RankedList title="Top events" rows={overview.topEvents} />
          <RankedList title="Top screens" rows={overview.topScreens} />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 items-stretch max-[720px]:grid-cols-1">
          <DonutChart
            title="Platforms"
            subtitle={`Last ${sessions.length} sessions`}
            segments={platformSegments}
            centerLabel={String(sessions.length)}
          />
          <RankedList
            title="App versions"
            subtitle={`Last ${sessions.length} sessions`}
            rows={versionRows}
          />
        </div>

        <SectionHeading>Activity</SectionHeading>
        <IssuesTable rows={issues} onStatusChange={handleIssueStatusChange} />
        <SessionsTable rows={sessions} />
      </div>
    </main>
  );
}
