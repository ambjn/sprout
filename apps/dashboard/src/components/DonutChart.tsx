type Segment = { label: string; value: number; color: string };

const CARD =
  "bg-surface-1 border border-line rounded-xl p-5 shadow-[0_1px_2px_rgba(11,11,11,0.03),0_1px_8px_rgba(11,11,11,0.03)]";

const SIZE = 140;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DonutChart({
  title,
  subtitle,
  segments,
  centerLabel,
}: {
  title: string;
  subtitle?: string;
  segments: Segment[];
  centerLabel?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className={CARD}>
      <p className="text-[13px] font-semibold text-text-secondary m-0 mb-4">{title}</p>
      {subtitle && <p className="-mt-2.5 mb-3.5 text-[11px] text-text-muted">{subtitle}</p>}
      {total === 0 ? (
        <p className="text-text-muted py-4 px-2 text-center">No data yet</p>
      ) : (
        <div className="flex items-center gap-5">
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label={title}
            className="shrink-0"
          >
            <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke="var(--color-gridline)"
                strokeWidth={STROKE}
              />
              {(() => {
                let offset = 0;
                return segments
                  .filter((s) => s.value > 0)
                  .map((s) => {
                    const length = (s.value / total) * CIRCUMFERENCE;
                    const dasharray = `${length} ${CIRCUMFERENCE - length}`;
                    const dashoffset = -offset;
                    offset += length;
                    return (
                      <circle
                        key={s.label}
                        cx={SIZE / 2}
                        cy={SIZE / 2}
                        r={RADIUS}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={STROKE}
                        strokeDasharray={dasharray}
                        strokeDashoffset={dashoffset}
                      />
                    );
                  });
              })()}
            </g>
            <text
              x={SIZE / 2}
              y={SIZE / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={20}
              fontWeight={600}
              fill="var(--color-text-primary)"
            >
              {centerLabel ?? total.toLocaleString()}
            </text>
          </svg>

          <div className="flex flex-col gap-2 min-w-0">
            {segments.map((s) => (
              <div key={s.label} className="flex items-center gap-2 text-[13px]">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="text-text-primary overflow-hidden text-ellipsis whitespace-nowrap">
                  {s.label}
                </span>
                <span className="text-text-secondary ml-auto [font-variant-numeric:tabular-nums]">
                  {s.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
