import { Card } from "./Card";

export function RankedList({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle?: string;
  rows: { name: string; count: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card title={title} subtitle={subtitle} className="h-full">
      {rows.length === 0 ? (
        <p className="text-text-muted py-4 px-2 text-center">No data yet</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((row) => (
            <div key={row.name}>
              <div className="flex justify-between text-[13px] mb-1">
                <span className="text-text-primary overflow-hidden text-ellipsis whitespace-nowrap mr-2">
                  {row.name}
                </span>
                <span className="text-text-secondary [font-variant-numeric:tabular-nums] shrink-0">
                  {row.count.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 rounded-[3px] bg-gridline overflow-hidden">
                <div
                  className="h-full rounded-[3px] bg-series-1"
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
