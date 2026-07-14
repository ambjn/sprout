import type { SessionRow } from "@/lib/types";
import { absoluteTime, formatDuration, platformLabel, relativeTime } from "@/lib/format";
import { Card } from "./Card";
import { DataTable, type Column } from "./DataTable";

const UNSET = <span className="italic text-text-muted">—</span>;

const COLUMNS: Column<SessionRow>[] = [
  {
    header: "Session",
    width: 170,
    minWidth: 90,
    render: (row) => row.sessionId,
    title: (row) => row.sessionId,
    className: "font-mono text-xs",
  },
  {
    header: "User",
    width: 150,
    minWidth: 90,
    render: (row) => row.identifiedUserId ?? UNSET,
    title: (row) => row.identifiedUserId,
    className: "font-mono text-xs",
  },
  {
    header: "Platform",
    width: 130,
    render: (row) => platformLabel(row.context),
    title: (row) => platformLabel(row.context),
  },
  {
    header: "Device",
    width: 140,
    render: (row) => row.context?.deviceModel ?? UNSET,
    title: (row) => row.context?.deviceModel,
    className: "text-text-secondary",
  },
  {
    header: "App version",
    width: 120,
    render: (row) =>
      row.context?.appVersion ? (
        <>
          v{row.context.appVersion}
          {row.context.buildNumber && (
            <span className="text-text-muted"> ({row.context.buildNumber})</span>
          )}
        </>
      ) : (
        UNSET
      ),
    className: "text-text-secondary",
  },
  {
    header: "Entry → exit",
    width: 220,
    minWidth: 110,
    render: (row) => `${row.entryScreen ?? "—"} → ${row.exitScreen ?? "—"}`,
    title: (row) => `${row.entryScreen ?? "—"} → ${row.exitScreen ?? "—"}`,
    className: "text-text-secondary",
  },
  { header: "Events", width: 84, render: (row) => row.eventCount.toLocaleString() },
  {
    header: "Errors",
    width: 84,
    render: (row) =>
      row.errorCount > 0 ? (
        <span className="text-status-critical">{row.errorCount}</span>
      ) : (
        <span className="text-text-muted">0</span>
      ),
  },
  {
    header: "Duration",
    width: 100,
    render: (row) => (row.endedAt ? formatDuration(row.endedAt - row.startedAt) : UNSET),
    className: "text-text-secondary",
  },
  {
    header: "Started",
    width: 110,
    render: (row) => relativeTime(row.startedAt),
    title: (row) => absoluteTime(row.startedAt),
    className: "text-text-secondary",
  },
];

export function SessionsTable({ rows }: { rows: SessionRow[] }) {
  return (
    <Card
      title="Recent sessions"
      action={<span className="text-[11px] text-text-muted">{rows.length} rows</span>}
    >
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row._id}
        emptyMessage="No sessions yet"
      />
    </Card>
  );
}
