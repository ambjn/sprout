import {
  DAY_MS,
  HOUR_MS,
  MAX_FUTURE_SKEW_MS,
  MAX_PAST_SKEW_MS,
  MAX_PROPERTY_KEYS,
  MAX_PROPERTY_VALUE_LENGTH,
} from "./constants.js";

export type Interval = "hour" | "day";

export function floorToBucket(ts: number, interval: Interval): number {
  const size = interval === "hour" ? HOUR_MS : DAY_MS;
  return Math.floor(ts / size) * size;
}

export function bucketSize(interval: Interval): number {
  return interval === "hour" ? HOUR_MS : DAY_MS;
}

/**
 * 32-bit FNV-1a, applied to the string forward and reversed, giving 16 hex
 * chars. Not cryptographic -- just a stable grouping key for error issues.
 */
export function fingerprintHash(s: string): string {
  const fwd = fnv1a(s);
  const rev = fnv1a([...s].reverse().join(""));
  return fwd.toString(16).padStart(8, "0") + rev.toString(16).padStart(8, "0");
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The first stack line that looks like a frame (`at fn (file)` V8-style or
 * `fn@file` JSC/Hermes-style). Used with the error type to build the issue
 * fingerprint, so the same error thrown from the same place groups together
 * even when its message varies (e.g. includes an id).
 */
export function topStackFrame(stack: string | undefined): string | null {
  if (!stack) return null;
  for (const line of stack.split("\n")) {
    const trimmed = line.trim();
    if (/^at\s+/.test(trimmed) || /.+@.+/.test(trimmed)) {
      return trimmed.slice(0, 200);
    }
  }
  return null;
}

/** Clamp client-supplied timestamps into a sane window around receipt time. */
export function clampOccurredAt(occurredAt: number, receivedAt: number): number {
  if (!Number.isFinite(occurredAt)) return receivedAt;
  const max = receivedAt + MAX_FUTURE_SKEW_MS;
  const min = receivedAt - MAX_PAST_SKEW_MS;
  return Math.min(Math.max(occurredAt, min), max);
}

/** Cap key count and truncate oversized string values (one huge string can
 * otherwise dominate the 1MB document budget). */
export function capProperties<T>(
  properties: Record<string, T> | undefined,
): Record<string, T> | undefined {
  if (!properties) return undefined;
  const keys = Object.keys(properties);
  let changed = keys.length > MAX_PROPERTY_KEYS;
  const capped: Record<string, T> = {};
  for (const key of keys.slice(0, MAX_PROPERTY_KEYS)) {
    const value = properties[key];
    if (typeof value === "string" && value.length > MAX_PROPERTY_VALUE_LENGTH) {
      capped[key] = value.slice(0, MAX_PROPERTY_VALUE_LENGTH) as T;
      changed = true;
    } else {
      capped[key] = value;
    }
  }
  return changed ? capped : properties;
}
