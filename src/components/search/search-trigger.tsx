"use client";

/**
 * Header search button.
 *
 * Dispatches a window event instead of importing the palette, so the palette's
 * chunk (and everything it pulls in) stays out of the header's module graph,
 * which is on the critical path for every page. The palette listens for this
 * and for ⌘K.
 */
export function SearchTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
      aria-label="Search this site. Shortcut: Command K"
      className="flex items-center gap-2 rounded border border-border px-2.5 py-1.5 text-sm text-subtle transition-colors hover:border-border-strong hover:text-text"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" strokeLinecap="round" />
      </svg>
      <kbd className="hidden font-mono text-2xs sm:block">⌘K</kbd>
    </button>
  );
}
