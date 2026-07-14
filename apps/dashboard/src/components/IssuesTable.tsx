import type { IssueRow } from "@/lib/types";
import { absoluteTime, relativeTime } from "@/lib/format";
import { DataTable, type Column } from "./DataTable";
import { StatusBadge } from "./StatusBadge";

const CARD =
  "bg-surface-1 border border-line rounded-xl p-5 shadow-[0_1px_2px_rgba(11,11,11,0.03),0_1px_8px_rgba(11,11,11,0.03)]";

const UNSET = <span className="italic text-text-muted">—</span>;

const COLUMNS: Column<IssueRow>[] = [
  {
    header: "Error",
    width: 320,
    minWidth: 120,
    render: (row) => row.title,
    title: (row) => row.sampleMessage ?? row.title,
  },
  {
    header: "Type",
    width: 120,
    render: (row) => row.errorType,
    className: "text-text-secondary text-xs",
  },
  {
    header: "Message",
    width: 280,
    minWidth: 120,
    render: (row) => row.sampleMessage ?? UNSET,
    title: (row) => row.sampleMessage,
    className: "text-text-secondary text-xs",
  },
  { header: "Events", width: 90, render: (row) => row.occurrenceCount.toLocaleString() },
  { header: "Sessions", width: 96, render: (row) => row.affectedSessionCount.toLocaleString() },
  {
    header: "First seen",
    width: 110,
    render: (row) => (row.firstSeenAt ? relativeTime(row.firstSeenAt) : UNSET),
    title: (row) => (row.firstSeenAt ? absoluteTime(row.firstSeenAt) : undefined),
    className: "text-text-secondary",
  },
  {
    header: "Last seen",
    width: 110,
    render: (row) => relativeTime(row.lastSeenAt),
    title: (row) => absoluteTime(row.lastSeenAt),
    className: "text-text-secondary",
  },
  { header: "Status", width: 110, render: (row) => <StatusBadge status={row.status} /> },
  {
    header: "Fingerprint",
    width: 150,
    render: (row) => row.fingerprint,
    title: (row) => row.fingerprint,
    className: "font-mono text-xs text-text-secondary",
  },
];

export function IssuesTable({ rows }: { rows: IssueRow[] }) {
  return (
    <div className={CARD}>
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[13px] font-semibold text-text-secondary m-0">Issues</p>
        <span className="text-[11px] text-text-muted">{rows.length} rows</span>
      </div>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.fingerprint}
        emptyMessage="No errors reported — nice."
      />
    </div>
  );
}
