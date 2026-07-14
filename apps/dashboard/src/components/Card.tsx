import type { ReactNode } from "react";

/**
 * Shared card chrome for every dashboard panel — one place for the surface,
 * border, radius, shadow, and the title/subtitle/action header row.
 */
export function Card({
  title,
  subtitle,
  action,
  className,
  children,
}: {
  title?: string;
  subtitle?: string;
  /** Right-aligned header slot (e.g. a row count or total). */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`bg-surface-1 border border-line rounded-xl p-5 shadow-[0_1px_2px_rgba(11,11,11,0.03),0_1px_8px_rgba(11,11,11,0.03)] ${className ?? ""}`}
    >
      {(title || action) && (
        <div className="flex items-baseline justify-between gap-2 mb-4">
          <div>
            {title && (
              <h2 className="text-sm font-semibold text-text-primary m-0">{title}</h2>
            )}
            {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
