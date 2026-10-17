/**
 * Admin chrome.
 *
 * A tool, not a showpiece: dense rows, small type, no animation, everything
 * reachable from the keyboard. It deliberately does not reuse the public
 * site's components, those are tuned for reading one thing at a time, and
 * this is tuned for scanning forty fields.
 *
 * Colour comes only from the semantic tokens in globals.css (`bg-surface`,
 * `text-muted`, `border-border-strong`, …). `npm run check:contrast` gates the
 * palette, and a hardcoded hex here would sit outside it.
 */

import type { ReactNode } from "react";

/** Bordered controls, not just tinted ones, `--border-strong` clears 1.4.11. */
export const inputClass =
  "w-full min-h-11 rounded-sm border border-border-strong bg-bg px-2 py-1.5 text-sm text-text " +
  "placeholder:text-subtle disabled:opacity-60";

export const buttonClass =
  "inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-border-strong bg-surface " +
  "px-2.5 py-1 text-2xs text-text transition-colors " +
  "hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";

export const primaryButtonClass =
  "inline-flex min-h-11 items-center gap-1.5 rounded-sm border border-accent bg-accent px-3 py-1.5 " +
  "text-2xs text-accent-contrast transition-colors " +
  "hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50";

export function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-2xs text-muted"
    >
      {children}
      {required && (
        <span className="ml-1 text-accent" title="Required by the schema">
          *
        </span>
      )}
    </label>
  );
}

export function Help({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1 text-xs leading-snug text-subtle">
      {children}
    </p>
  );
}

export function FieldError({ id, messages }: { id: string; messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs leading-snug text-accent">
      {messages.join(" · ")}
    </p>
  );
}

/** A titled block. `tone="warn"` marks something the owner must look at. */
export function Panel({
  title,
  tone = "plain",
  children,
}: {
  title?: string;
  tone?: "plain" | "warn";
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded border p-3 ${
        tone === "warn" ? "border-accent bg-accent-subtle" : "border-border bg-surface"
      }`}
    >
      {title && (
        <h2 className="mb-2 text-2xs text-muted">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function SectionRule({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-8 mb-3 border-b border-border pb-1.5 text-2xs text-muted">
      {children}
    </h2>
  );
}

/** Small monospace count/state marker. */
export function Tag({
  children,
  tone = "plain",
}: {
  children: ReactNode;
  tone?: "plain" | "accent" | "muted";
}) {
  const tones = {
    plain: "border-border-strong text-text",
    accent: "border-accent text-accent",
    muted: "border-border text-subtle",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-px text-2xs ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
