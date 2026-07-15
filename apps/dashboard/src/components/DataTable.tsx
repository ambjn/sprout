import { useRef, useState, type ReactNode } from "react";

export type Column<T> = {
  header: string;
  /** Initial width in px — every column is drag-resizable at its divider line. */
  width: number;
  minWidth?: number;
  render: (row: T) => ReactNode;
  /** Full-text hover for cells whose content may truncate. */
  title?: (row: T) => string | undefined;
  /** Extra classes for this column's cells (e.g. font-mono). */
  className?: string;
};

/** Shared empty-value marker for table cells. */
export const UNSET = <span className="italic text-text-muted">—</span>;

const TH =
  "sticky top-0 z-10 bg-surface-1 text-left font-semibold text-text-muted text-[11px] uppercase tracking-[0.03em] py-2 px-3 border-b border-r border-gridline last:border-r-0 whitespace-nowrap overflow-hidden text-ellipsis";
const TD =
  "py-2.5 px-3 border-b border-r border-gridline last:border-r-0 text-text-primary [font-variant-numeric:tabular-nums] whitespace-nowrap overflow-hidden text-ellipsis";

/**
 * Detailed scrollable data grid: sticky header, cell borders, both-axis
 * scrolling, and drag-resizable columns so truncated text is always
 * reachable — plus `title` hover for the full value. Each divider is a
 * full-height grab stripe (double-click resets the column), not just a
 * handle in the header, so the line is draggable at any row. The dividers
 * are absolutely-positioned from the column widths, which works because the
 * table's width is exactly their sum (no stretch-to-fit redistribution).
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
  // Divider i sits at the right edge of column i.
  const dividerLefts = widths.map((_, i) => widths.slice(0, i + 1).reduce((a, b) => a + b, 0));

  return (
    <div className="overflow-auto max-h-[420px] rounded-lg border border-gridline">
      <div className="relative" style={{ width: totalWidth }}>
        <table
          className="w-full border-collapse text-[13px]"
          style={{ tableLayout: "fixed" }}
        >
          <colgroup>
            {columns.map((col, i) => (
              <col key={col.header} style={{ width: widths[i] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.header} className={TH}>
                  {col.header}
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

        {/* Full-height resize stripes, one per column divider — above the
            sticky header (z-20 > z-10) so the line is grabbable everywhere. */}
        {columns.map((col, i) => (
          <div
            key={col.header}
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize · double-click to reset"
            onPointerDown={(e) => startResize(e, i)}
            onDoubleClick={() =>
              setWidths((prev) => prev.map((w, j) => (j === i ? columns[i].width : w)))
            }
            className="absolute top-0 bottom-0 w-2.5 cursor-col-resize select-none touch-none z-20 border-r-2 border-transparent hover:border-series-1/70 active:border-series-1"
            style={{ left: dividerLefts[i] - 8 }}
          />
        ))}
      </div>
    </div>
  );
}
