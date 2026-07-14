import type { IssueRow } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

const CARD =
  "bg-surface-1 border border-line rounded-xl p-5 shadow-[0_1px_2px_rgba(11,11,11,0.03),0_1px_8px_rgba(11,11,11,0.03)]";
const TH =
  "text-left font-semibold text-text-muted text-[11px] uppercase tracking-[0.03em] pb-2 px-2 border-b border-gridline";
const TD = "py-2.5 px-2 border-b border-gridline text-text-primary [font-variant-numeric:tabular-nums]";

export function IssuesTable({ rows }: { rows: IssueRow[] }) {
  return (
    <div className={CARD}>
      <p className="text-[13px] font-semibold text-text-secondary m-0 mb-4">Issues</p>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={TH}>Error</th>
            <th className={TH}>Type</th>
            <th className={TH}>Events</th>
            <th className={TH}>Sessions</th>
            <th className={TH}>Last seen</th>
            <th className={TH}>Status</th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child_td]:border-b-0">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-text-muted py-4 px-2 text-center">
                No errors reported — nice.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.fingerprint}>
                <td
                  className={`${TD} max-w-[360px] overflow-hidden text-ellipsis whitespace-nowrap`}
                  title={row.sampleMessage ?? row.title}
                >
                  {row.title}
                </td>
                <td className={`${TD} text-text-secondary text-xs`}>{row.errorType}</td>
                <td className={TD}>{row.occurrenceCount}</td>
                <td className={TD}>{row.affectedSessionCount}</td>
                <td className={`${TD} text-text-secondary`}>{relativeTime(row.lastSeenAt)}</td>
                <td className={TD}>
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
