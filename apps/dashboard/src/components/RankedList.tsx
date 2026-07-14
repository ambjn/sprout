const CARD =
  "bg-surface-1 border border-line rounded-xl p-5 shadow-[0_1px_2px_rgba(11,11,11,0.03),0_1px_8px_rgba(11,11,11,0.03)]";

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
    <div className={CARD}>
      <p className="text-[13px] font-semibold text-text-secondary m-0 mb-4">{title}</p>
      {subtitle && <p className="-mt-2.5 mb-3.5 text-[11px] text-text-muted">{subtitle}</p>}
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
    </div>
  );
}
