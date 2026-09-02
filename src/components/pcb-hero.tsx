import { Bench } from "@/components/game/bench";
import type { BenchProject } from "@/components/game/types";
import { getAllProjects } from "@/lib/content";

/* ============================================================================
   The Bench, server half.

   Reads the corpus on the server and hands the client a plain array. Two
   reasons this boundary is drawn here rather than deeper in:

     1. `@/lib/content` is `server-only`, so it physically cannot cross into the
        canvas layer; and
     2. a `Project` carries decisions, benchmarks, resume bullets and an MDX
        body. None of that is needed to draw a chip, and shipping it would put
        the entire corpus in the client payload of the home page.

   The <ul> the client renders is real, server-rendered markup: with JavaScript
   off, the canvas never mounts and the same list renders as an ordinary card
   grid of project links. The board is the enhancement, not the content.
   ========================================================================= */

const MAX_MODULES = 12;

export function PcbHero() {
  const projects: BenchProject[] = getAllProjects()
    .slice(0, MAX_MODULES)
    .map((project) => ({
      slug: project.slug,
      title: project.title,
      pitch: project.pitch,
      status: project.status,
      languages: project.languages.slice(0, 2),
      metric: project.metrics[0]
        ? { value: project.metrics[0].value, label: project.metrics[0].label }
        : undefined,
    }));

  if (projects.length === 0) return null;

  // No Container and no bottom border of its own. The page places this inside
  // its own measure, and the section below already opens with a rule; two
  // hairlines with a gap between them reads as an empty box rather than a
  // divider.
  return (
    <section aria-labelledby="bench-heading">
      <div className="mt-4">
        {/* Same heading treatment as every other section on the page. It was
            a small mono label, which made the one interactive thing on the
            home page read as a caption for the section above it. */}
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          {/* The page's only h1. The home page opens on the board rather
              than on a sentence about the person who made it. */}
          <h1
            id="bench-heading"
            className="font-display text-3xl tracking-tight sm:text-4xl"
          >
            The bench
          </h1>
          <p className="font-mono text-2xs tracking-wide text-subtle uppercase">
            Every project, as one board
          </p>
        </div>

        <Bench projects={projects} />
      </div>
    </section>
  );
}
