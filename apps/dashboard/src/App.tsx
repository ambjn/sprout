import { useEffect, useState } from "react";
import { getDashboardData } from "@/lib/data";
import { computeDelta } from "@/lib/format";
import { StatTile } from "@/components/StatTile";
import { EventsChart } from "@/components/EventsChart";
import { DonutChart } from "@/components/DonutChart";
import { RankedList } from "@/components/RankedList";
import { IssuesTable } from "@/components/IssuesTable";
import { SessionsTable } from "@/components/SessionsTable";
import { STATUS_META } from "@/components/StatusBadge";
import type { DashboardData, IssueRow } from "@/lib/types";

const PAGE = "max-w-[1200px] mx-auto px-6 pt-8 pb-16";
const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted mt-1 -mb-1.5";

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
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDashboardData().then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return <main className={PAGE} />;
  }

  const { overview, previousTotals, sessions, issues, isDemo } = data;

  const eventsDelta = previousTotals
    ? computeDelta(overview.totals.events, previousTotals.events, "up")
    : null;
  const sessionsDelta = previousTotals
    ? computeDelta(overview.totals.sessions, previousTotals.sessions, "up")
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
      <div className="flex items-baseline justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.01em] m-0">Sprout</h1>
          <p className="text-[13px] text-text-muted">Insights — last 24 hours</p>
        </div>
      </div>

      {isDemo && (
        <div className="bg-surface-1 border border-line border-l-[3px] border-l-status-warning rounded-lg py-2.5 px-3.5 text-[13px] text-text-secondary mb-6">
          Showing demo data — set <code className="font-mono">VITE_CONVEX_URL</code> and{" "}
          <code className="font-mono">VITE_SPROUT_DASHBOARD_KEY</code> in <code className="font-mono">.env</code> to connect
          to a real deployment.
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-4 gap-4 mb-4 max-[900px]:grid-cols-2 max-[720px]:grid-cols-1">
          <StatTile label="Events" value={overview.totals.events} delta={eventsDelta} />
          <StatTile label="Sessions" value={overview.totals.sessions} delta={sessionsDelta} />
          <StatTile label="Errors" value={overview.totals.errors} />
          <StatTile label="Crash-free sessions" value={crashFreePct} />
        </div>

        <p className={EYEBROW}>Trends</p>
        <div className="grid grid-cols-[2fr_1fr] gap-4 mb-4 items-start max-[900px]:grid-cols-1">
          <EventsChart series={overview.series} />
          <DonutChart
            title="Issues by status"
            subtitle={`${issues.length} tracked`}
            segments={issueStatusSegments}
            centerLabel={String(issues.length)}
          />
        </div>

        <p className={EYEBROW}>Breakdown</p>
        <div className="grid grid-cols-2 gap-4 mb-4 max-[720px]:grid-cols-1">
          <RankedList title="Top events" rows={overview.topEvents} />
          <RankedList title="Top screens" rows={overview.topScreens} />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 max-[720px]:grid-cols-1">
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

        <p className={EYEBROW}>Activity</p>
        <IssuesTable rows={issues} />
        <SessionsTable rows={sessions} />
      </div>
    </main>
  );
}
