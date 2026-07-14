import { useMemo, useState } from "react";

type Point = { bucketStart: number; count: number };

const CARD =
  "bg-surface-1 border border-line rounded-xl p-5 shadow-[0_1px_2px_rgba(11,11,11,0.03),0_1px_8px_rgba(11,11,11,0.03)]";

const WIDTH = 1040;
const HEIGHT = 280;
const PAD_LEFT = 36;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

function niceMax(value: number): number {
  if (value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function bucketLabel(ts: number, interval: "hour" | "day"): string {
  return interval === "hour"
    ? new Date(ts).toLocaleTimeString(undefined, { hour: "numeric" })
    : new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function tooltipLabel(ts: number, interval: "hour" | "day"): string {
  return interval === "hour"
    ? new Date(ts).toLocaleString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
      })
    : new Date(ts).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
}

export function EventsChart({
  series,
  subtitle,
  interval,
}: {
  series: Point[];
  subtitle: string;
  interval: "hour" | "day";
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { points, yTicks, xTicks } = useMemo(() => {
    const max = niceMax(Math.max(1, ...series.map((p) => p.count)));
    const innerW = WIDTH - PAD_LEFT - PAD_RIGHT;
    const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const step = series.length > 1 ? innerW / (series.length - 1) : 0;

    const pts = series.map((p, i) => ({
      x: PAD_LEFT + step * i,
      y: PAD_TOP + innerH * (1 - p.count / max),
      ...p,
    }));

    const ticks = [0, 0.5, 1].map((f) => ({
      value: Math.round(max * f),
      y: PAD_TOP + innerH * (1 - f),
    }));

    // Sparse time labels: first, quarter, mid, three-quarter, last bucket.
    const xIdx =
      pts.length > 1
        ? [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (pts.length - 1))))]
        : [];
    const xT = xIdx.map((i) => ({ x: pts[i].x, label: bucketLabel(pts[i].bucketStart, interval) }));

    return { points: pts, yTicks: ticks, xTicks: xT };
  }, [series, interval]);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${HEIGHT - PAD_BOTTOM} L ${points[0].x} ${HEIGHT - PAD_BOTTOM} Z`
      : "";

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  function handleMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
    if (points.length === 0) return;
    let nearest = 0;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - x);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <div className={CARD}>
      <p className="text-[13px] font-semibold text-text-secondary m-0 mb-4">
        Events <span className="font-normal text-text-muted">· {subtitle}</span>
      </p>
      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto block"
          role="img"
          aria-label={`Events, ${subtitle}`}
        >
          {yTicks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={tick.y}
                y2={tick.y}
                stroke="var(--color-gridline)"
                strokeWidth={1}
              />
              <text
                x={PAD_LEFT - 8}
                y={tick.y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--color-text-muted)"
              >
                {tick.value.toLocaleString()}
              </text>
            </g>
          ))}

          {xTicks.map((tick, i) => (
            <text
              key={`${tick.x}-${i}`}
              x={tick.x}
              y={HEIGHT - 8}
              textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
              fontSize={10}
              fill="var(--color-text-muted)"
            >
              {tick.label}
            </text>
          ))}

          <path d={areaPath} fill="var(--color-series-1)" opacity={0.1} />
          <path d={linePath} fill="none" stroke="var(--color-series-1)" strokeWidth={2} />

          {hovered && (
            <>
              <line
                x1={hovered.x}
                x2={hovered.x}
                y1={PAD_TOP}
                y2={HEIGHT - PAD_BOTTOM}
                stroke="var(--color-baseline)"
                strokeWidth={1}
              />
              <circle
                cx={hovered.x}
                cy={hovered.y}
                r={5}
                fill="var(--color-series-1)"
                stroke="var(--color-surface-1)"
                strokeWidth={2}
              />
            </>
          )}

          <rect
            x={PAD_LEFT}
            y={0}
            width={WIDTH - PAD_LEFT - PAD_RIGHT}
            height={HEIGHT}
            fill="transparent"
            onPointerMove={handleMove}
            onPointerLeave={() => setHoverIndex(null)}
          />
        </svg>

        {hovered && (
          <div
            role="status"
            className="absolute top-2 rounded-md py-1.5 px-2.5 text-xs whitespace-nowrap pointer-events-none shadow-[0_2px_8px_rgba(0,0,0,0.08)] bg-surface-1 border border-line"
            style={{
              left: `${(hovered.x / WIDTH) * 100}%`,
              transform: hovered.x > WIDTH * 0.75 ? "translateX(-100%)" : "translateX(8px)",
            }}
          >
            <div className="font-semibold text-text-primary">
              {hovered.count.toLocaleString()} events
            </div>
            <div className="text-text-muted">{tooltipLabel(hovered.bucketStart, interval)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
