"use client";

/**
 * The only client component on this route.
 *
 * Cmd-P already works, the print stylesheet does not need a button. This
 * exists because a recruiter reading on a phone has no keyboard shortcut, and
 * "Save as PDF" is not obviously the same action as "Print" to everyone who
 * needs the file.
 *
 * It stays a <button> rather than an anchor: it performs an action in the
 * current document, it has no href worth sharing, and giving it one would put a
 * dead link in the tab order.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded border border-border-strong px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-accent"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M4.5 6V2.5h7V6" />
        <path d="M4.5 12H3a1.5 1.5 0 0 1-1.5-1.5v-3A1.5 1.5 0 0 1 3 6h10a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 13 12h-1.5" />
        <path d="M4.5 10h7v3.5h-7z" />
      </svg>
      Print / Save as PDF
    </button>
  );
}
