import { RANGE_KEYS, RANGES, type RangeKey } from "@/lib/ranges";

/**
 * Date-range presets — a segmented row of ordinary buttons, styled to the
 * chart chrome. Scopes every chart, stat, and table below it.
 */
export function RangePicker({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (range: RangeKey) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Date range"
      className="inline-flex rounded-lg border border-line bg-surface-1 p-0.5"
    >
      {RANGE_KEYS.map((key) => {
        const selected = key === value;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(key)}
            className={`px-3.5 py-1.5 text-[13px] rounded-md transition-colors ${
              selected
                ? "bg-text-primary text-surface-1 font-semibold"
                : "text-text-secondary hover:text-text-primary hover:bg-gridline/50"
            }`}
            title={RANGES[key].label}
          >
            {RANGES[key].short}
          </button>
        );
      })}
    </div>
  );
}
