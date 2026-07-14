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
            className={`px-3 py-1 text-[13px] rounded-md transition-colors ${
              selected
                ? "bg-gridline font-semibold text-text-primary"
                : "text-text-secondary hover:text-text-primary"
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
