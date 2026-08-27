"use client";

import { useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";

const ORDER: Theme[] = ["system", "light", "dark"];

const LABEL: Record<Theme, string> = {
  system: "Match system",
  light: "Light",
  dark: "Dark",
};

/* ---------------------------------------------------------------------------
   The theme lives on <html data-theme>, which the blocking script in
   theme-script.tsx sets before first paint. That attribute is the source of
   truth, so this component subscribes to it rather than keeping a parallel
   copy in React state — no effect, no cascading render, and no window where
   the button disagrees with the page it is sitting on.
   ------------------------------------------------------------------------ */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" || attr === "dark" ? attr : "system";
}

/** The server cannot know the visitor's choice; "system" is the neutral render
 *  and matches what the markup ships with. */
function getServerSnapshot(): Theme {
  return "system";
}

function setTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
    localStorage.removeItem("theme");
  } else {
    root.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }
  listeners.forEach((fn) => fn());
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <button
      type="button"
      onClick={() => setTheme(ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length])}
      // Announce the current state — the icon alone is not enough.
      aria-label={`Theme: ${LABEL[theme]}. Activate to change.`}
      title={LABEL[theme]}
      className="grid size-9 place-items-center rounded border border-border text-muted transition-colors hover:border-border-strong hover:text-text"
    >
      <Icon theme={theme} />
    </button>
  );
}

function Icon({ theme }: { theme: Theme }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (theme === "light") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="3.1" />
        <path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2L3.1 3.1" />
      </svg>
    );
  }

  if (theme === "dark") {
    return (
      <svg {...common}>
        <path d="M13.5 9.6A5.9 5.9 0 0 1 6.4 2.5a5.9 5.9 0 1 0 7.1 7.1Z" />
      </svg>
    );
  }

  // system — a display, i.e. "whatever the machine says"
  return (
    <svg {...common}>
      <rect x="1.6" y="2.6" width="12.8" height="8.6" rx="1.2" />
      <path d="M5.6 13.8h4.8" />
    </svg>
  );
}
