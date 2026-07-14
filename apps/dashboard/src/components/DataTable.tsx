import { useRef, useState, type ReactNode } from "react";

export type Column<T> = {
  header: string;
  /** Initial width in px — every column is drag-resizable from its header edge. */
  width: number;
  minWidth?: number;
  render: (row: T) => ReactNode;
  /** Full-text hover for cells whose content may truncate. */
  title?: (row: T) => string | undefined;
  /** Extra classes for this column's cells (e.g. font-mono). */
  className?: string;
};

const TH =
  "group/th relative sticky top-0 z-10 bg-surface-1 text-left font-semibold text-text-muted text-[11px] uppercase tracking-[0.03em] py-2 px-3 border-b border-r border-gridline last:border-r-0 whitespace-nowrap overflow-hidden text-ellipsis";
const TD =
  "py-2.5 px-3 border-b border-r border-gridline last:border-r-0 text-text-primary [font-variant-numeric:tabular-nums] whitespace-nowrap overflow-hidden text-ellipsis";

/**
 * Detailed scrollable data grid: sticky header, cell borders, both-axis
 * scrolling, and drag-resizable columns (double-click a handle to reset) so
 * truncated text is always reachable — plus `title` hover for the full value.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage: string;
}) {
  const [widths, setWidths] = useState(() => columns.map((c) => c.width));
  const widthsRef = useRef(widths);
  widthsRef.current = widths;

  function startResize(e: React.PointerEvent<HTMLDivElement>, index: number) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widthsRef.current[index];
    const min = columns[index].minWidth ?? 64;
    const onMove = (ev: PointerEvent) => {
      const next = Math.max(min, startWidth + ev.clientX - startX);
      setWidths((prev) => prev.map((w, i) => (i === index ? next : w)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const totalWidth = widths.reduce((a, b) => a + b, 0);

  return (
    <div className="overflow-auto max-h-[420px] rounded-lg border border-gridline">
      <table
        className="border-collapse text-[13px]"
        style={{ width: totalWidth, minWidth: "100%", tableLayout: "fixed" }}
      >
        <colgroup>
          {columns.map((col, i) => (
            <col key={col.header} style={{ width: widths[i] }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={col.header} className={TH}>
                {col.header}
                <div
                  role="separator"
                  aria-orientation="vertical"
                  title="Drag to resize · double-click to reset"
                  onPointerDown={(e) => startResize(e, i)}
                  onDoubleClick={() =>
                    setWidths((prev) => prev.map((w, j) => (j === i ? columns[i].width : w)))
                  }
                  className="absolute right-0 top-0 h-full w-2.5 cursor-col-resize select-none touch-none border-r-2 border-transparent hover:border-series-1/70 active:border-series-1"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child_td]:border-b-0">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-text-muted py-4 px-3 text-center">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-page-plane/60">
                {columns.map((col) => (
                  <td
                    key={col.header}
                    className={`${TD} ${col.className ?? ""}`}
                    title={col.title?.(row)}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
