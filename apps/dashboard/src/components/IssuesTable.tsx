import { useMemo } from "react";
import type { IssueRow } from "@/lib/types";
import { absoluteTime, relativeTime } from "@/lib/format";
import { Card } from "./Card";
import { DataTable, UNSET, type Column } from "./DataTable";
import { StatusSelect } from "./StatusSelect";

export function IssuesTable({
  rows,
  onStatusChange,
}: {
  rows: IssueRow[];
  onStatusChange: (fingerprint: string, status: IssueRow["status"]) => void;
}) {
  const columns = useMemo<Column<IssueRow>[]>(
    () => [
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
      {
        header: "Sessions",
        width: 96,
        render: (row) => row.affectedSessionCount.toLocaleString(),
      },
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
      {
        header: "Status",
        width: 130,
        render: (row) => (
          <StatusSelect
            value={row.status}
            onChange={(status) => onStatusChange(row.fingerprint, status)}
          />
        ),
      },
      {
        header: "Fingerprint",
        width: 150,
        render: (row) => row.fingerprint,
        title: (row) => row.fingerprint,
        className: "font-mono text-xs text-text-secondary",
      },
    ],
    [onStatusChange],
  );

  return (
    <Card
      title="Issues"
      action={<span className="text-[11px] text-text-muted">{rows.length} rows</span>}
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.fingerprint}
        emptyMessage="No errors reported — nice."
      />
    </Card>
  );
}
