/**
 * Placeholder detection.
 *
 * The pattern is the same one `scripts/check-content.ts` warns on, kept
 * deliberately identical so the admin's to-do list and CI's warning list are
 * the same list. If they drift, the admin starts telling the owner a file is
 * finished while the gate says it is not.
 *
 * Pure — no `node:*`, importable from client components.
 */

import type { Placeholder } from "./store.ts";

/** Mirrors scripts/check-content.ts `findPlaceholders`. */
export const PLACEHOLDER_PATTERN = /\b(TODO|CONFIRM|FIXME|XXX|Lorem ipsum)\b/i;

export function findPlaceholders(raw: string): Placeholder[] {
  const out: Placeholder[] = [];
  raw.split("\n").forEach((line, i) => {
    if (PLACEHOLDER_PATTERN.test(line)) {
      out.push({ line: i + 1, text: line.trim().slice(0, 120) });
    }
  });
  return out;
}

export function hasPlaceholder(value: unknown): boolean {
  if (typeof value === "string") return PLACEHOLDER_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(hasPlaceholder);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasPlaceholder);
  }
  return false;
}
