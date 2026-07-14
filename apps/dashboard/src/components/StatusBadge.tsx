import type { IssueRow } from "@/lib/types";

export const STATUS_META: Record<
  IssueRow["status"],
  { label: string; color: string }
> = {
  open: { label: "Open", color: "var(--color-status-serious)" },
  resolved: { label: "Resolved", color: "var(--color-status-good)" },
  ignored: { label: "Ignored", color: "var(--color-text-muted)" },
};

export function StatusBadge({ status }: { status: IssueRow["status"] }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-[5px] text-xs font-medium py-0.5 px-2 rounded-full text-text-secondary">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}
