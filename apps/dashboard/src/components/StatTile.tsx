import type { Delta } from "@/lib/format";

const CARD =
  "bg-surface-1 border border-line rounded-xl p-5 shadow-[0_1px_2px_rgba(11,11,11,0.03),0_1px_8px_rgba(11,11,11,0.03)]";

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export function StatTile({
  label,
  value,
  delta,
}: {
  label: string;
  value: number | string;
  delta?: Delta | null;
}) {
  return (
    <div className={CARD}>
      <p className="m-0 mb-2 text-[13px] text-text-secondary">{label}</p>
      <p className="m-0 text-[32px] font-semibold [font-feature-settings:'pnum']">
        {typeof value === "number" ? formatCompact(value) : value}
      </p>
      {delta && (
        <p
          className={`mt-1.5 mb-0 text-xs font-medium ${
            delta.isGood ? "text-status-good" : "text-status-critical"
          }`}
        >
          {delta.label}
        </p>
      )}
    </div>
  );
}
