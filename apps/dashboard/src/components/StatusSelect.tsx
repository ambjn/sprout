import type { IssueRow } from "@/lib/types";

export const STATUS_META: Record<
  IssueRow["status"],
  { label: string; color: string }
> = {
  open: { label: "Open", color: "var(--color-status-serious)" },
  resolved: { label: "Resolved", color: "var(--color-status-good)" },
  ignored: { label: "Ignored", color: "var(--color-text-muted)" },
};

export const ISSUE_STATUSES: IssueRow["status"][] = ["open", "resolved", "ignored"];

/**
 * Issue status as a control. The visible pill is presentation only; an
 * invisible native select stretched over the WHOLE pill receives the click,
 * so the picker opens no matter where on the pill you press (a select's own
 * clickable area is just its text).
 */
export function StatusSelect({
  value,
  onChange,
}: {
  value: IssueRow["status"];
  onChange: (status: IssueRow["status"]) => void;
}) {
  const meta = STATUS_META[value];
  return (
    <span className="relative inline-flex items-center gap-[5px] text-xs font-medium py-0.5 px-2 rounded-full text-text-secondary border border-gridline/70 hover:border-baseline cursor-pointer">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} />
      {meta.label}
      <span aria-hidden className="text-text-muted text-[9px]">
        ▾
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as IssueRow["status"])}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label="Issue status"
      >
        {ISSUE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>
    </span>
  );
}
