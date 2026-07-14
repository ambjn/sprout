import type { SessionRow } from "@/lib/types";
import { platformLabel, relativeTime, shortId } from "@/lib/format";

const CARD =
  "bg-surface-1 border border-line rounded-xl p-5 shadow-[0_1px_2px_rgba(11,11,11,0.03),0_1px_8px_rgba(11,11,11,0.03)]";
const TH =
  "text-left font-semibold text-text-muted text-[11px] uppercase tracking-[0.03em] pb-2 px-2 border-b border-gridline";
const TD = "py-2.5 px-2 border-b border-gridline text-text-primary [font-variant-numeric:tabular-nums]";

export function SessionsTable({ rows }: { rows: SessionRow[] }) {
  return (
    <div className={CARD}>
      <p className="text-[13px] font-semibold text-text-secondary m-0 mb-4">Recent sessions</p>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className={TH}>Session</th>
            <th className={TH}>User</th>
            <th className={TH}>Platform</th>
            <th className={TH}>Entry → exit</th>
            <th className={TH}>Events</th>
            <th className={TH}>Errors</th>
            <th className={TH}>Started</th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child_td]:border-b-0">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-text-muted py-4 px-2 text-center">
                No sessions yet
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row._id}>
                <td className={`${TD} font-mono text-xs`}>{shortId(row.sessionId)}</td>
                <td className={`${TD} font-mono text-xs`}>
                  {row.identifiedUserId ? (
                    shortId(row.identifiedUserId)
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
                <td className={TD}>
                  <div className="text-text-primary">{platformLabel(row.context)}</div>
                  {row.context?.appVersion && (
                    <div className="text-text-muted text-[11px]">v{row.context.appVersion}</div>
                  )}
                </td>
                <td className={`${TD} text-text-secondary`}>
                  {row.entryScreen ?? "—"} → {row.exitScreen ?? "—"}
                </td>
                <td className={TD}>{row.eventCount}</td>
                <td className={TD}>
                  {row.errorCount > 0 ? (
                    <span className="text-status-critical">{row.errorCount}</span>
                  ) : (
                    <span className="text-text-muted">0</span>
                  )}
                </td>
                <td className={`${TD} text-text-secondary`}>{relativeTime(row.startedAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
