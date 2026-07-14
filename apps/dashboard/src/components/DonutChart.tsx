import { Card } from "./Card";

type Segment = { label: string; value: number; color: string };

const SIZE = 170;
const STROKE = 22;
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

  // Cumulative offset (in stroke length) at which each segment's arc starts.
  let cumulative = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const length = (s.value / total) * CIRCUMFERENCE;
      const dashoffset = -cumulative;
      cumulative += length;
      return { ...s, length, dashoffset };
    });

  return (
    <Card title={title} subtitle={subtitle} className="h-full flex flex-col">
      {total === 0 ? (
        <p className="text-text-muted py-4 px-2 text-center flex-1 flex items-center justify-center">
          No data yet
        </p>
      ) : (
        <div className="flex items-center gap-5 flex-1">
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
              {arcs.map((arc) => (
                <circle
                  key={arc.label}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={STROKE}
                  strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
                  strokeDashoffset={arc.dashoffset}
                />
              ))}
            </g>
            <text
              x={SIZE / 2}
              y={SIZE / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={28}
              fontWeight={600}
              fill="var(--color-text-primary)"
            >
              {centerLabel ?? total.toLocaleString()}
            </text>
          </svg>

          <div className="flex flex-col gap-2.5 min-w-0 flex-1">
            {segments.map((s) => {
              const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
              return (
                <div key={s.label} className="flex items-center gap-2.5 text-sm">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: s.color }}
                  />
                  <span className="text-text-primary overflow-hidden text-ellipsis whitespace-nowrap">
                    {s.label}
                  </span>
                  <span className="text-text-primary font-medium ml-auto [font-variant-numeric:tabular-nums] shrink-0">
                    {s.value.toLocaleString()}
                    <span className="text-text-muted"> · {pct}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
