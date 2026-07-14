import type { IssueRow } from "@/lib/types";

export const STATUS_META: Record<
  IssueRow["status"],
  { label: string; color: string }
> = {
  open: { label: "Open", color: "var(--color-status-serious)" },
  resolved: { label: "Resolved", color: "var(--color-status-good)" },
  ignored: { label: "Ignored", color: "var(--color-text-muted)" },
};

const STATUSES: IssueRow["status"][] = ["open", "resolved", "ignored"];

export function StatusBadge({ status }: { status: IssueRow["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-[5px] text-xs font-medium py-0.5 px-2 rounded-full text-text-secondary">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

/** The badge as a control: a native select styled to the badge chrome. */
export function StatusSelect({
  value,
  onChange,
}: {
  value: IssueRow["status"];
  onChange: (status: IssueRow["status"]) => void;
}) {
  const meta = STATUS_META[value];
  return (
    <label className="inline-flex items-center gap-[5px] text-xs font-medium py-0.5 px-2 rounded-full text-text-secondary border border-transparent hover:border-gridline cursor-pointer">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as IssueRow["status"])}
        onClick={(e) => e.stopPropagation()}
        className="appearance-none bg-transparent cursor-pointer focus:outline-none text-text-secondary"
        aria-label="Issue status"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>
      <span aria-hidden className="text-text-muted text-[9px]">
        ▾
      </span>
    </label>
  );
}
