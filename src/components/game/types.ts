/**
 * The serialisable slice of a Project that crosses the server → client
 * boundary for The Bench.
 *
 * Deliberately narrow. `Project` carries decisions, benchmarks, resume bullets
 * and an MDX body; none of that belongs in the client bundle just to draw a
 * chip. Keeping this type hand-written (rather than `Pick<Project, …>`) also
 * means the client module graph never imports `@/lib/content/schema`, which
 * would drag Zod along with it.
 */
export interface BenchProject {
  slug: string;
  title: string;
  pitch: string;
  status: "shipped" | "building" | "planned";
  /** First two, for the chip's package marking. */
  languages: string[];
  /** The card-face number, if the project has one. */
  metric?: { value: string; label: string };
}

/**
 * Where the probe is being told to go, in board CSS pixels.
 *
 * Carried by a ref rather than by props, deliberately: pointer movement would
 * otherwise re-render a React tree 120 times a second to move a crosshair. The
 * shell writes into `ref.current`, the scene reads it on its own clock, and no
 * render is scheduled for anything the canvas can draw by itself.
 *
 * The type lives here rather than beside the scene so the always-loaded shell
 * can name it without its module graph ever touching Phaser.
 */
export interface ProbeTarget {
  x: number;
  y: number;
  /** False when the pointer has left the board — the probe fades out. */
  visible: boolean;
}

/** Reference designator, the way a real board labels its parts: U1, U2, … */
export function designator(index: number): string {
  return `U${index + 1}`;
}

export const STATUS_LABEL: Record<BenchProject["status"], string> = {
  shipped: "Shipped",
  building: "Building",
  planned: "Planned",
};
