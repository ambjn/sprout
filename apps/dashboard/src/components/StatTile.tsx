import { Card } from "./Card";
import { formatCompact, type Delta } from "@/lib/format";

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
    <Card>
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
    </Card>
  );
}
