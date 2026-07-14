export function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

export type Delta = { pct: number | null; isGood: boolean; label: string };

export function computeDelta(
  current: number,
  previous: number,
  goodDirection: "up" | "down",
): Delta | null {
  if (previous === 0) {
    if (current === 0) return null;
    return { pct: null, isGood: goodDirection === "up", label: "new vs prior 24h" };
  }
  const pct = ((current - previous) / previous) * 100;
  const isGood = pct === 0 ? true : pct > 0 === (goodDirection === "up");
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "–";
  const label = `${arrow} ${Math.abs(pct).toFixed(0)}% vs prior 24h`;
  return { pct, isGood, label };
}

export function platformLabel(context?: {
  osName?: string;
  osVersion?: string;
}): string {
  if (!context?.osName) return "—";
  return context.osVersion ? `${context.osName} ${context.osVersion}` : context.osName;
}
