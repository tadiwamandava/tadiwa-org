import { Container } from "@/components/ui";
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

  return (
    <section
      className="border-b border-border"
      aria-labelledby="bench-heading"
    >
      <Container wide className="py-14">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-border pb-2">
          <h2
            id="bench-heading"
            className="font-mono text-xs tracking-[0.14em] text-muted uppercase"
          >
            The Bench
          </h2>
          <p className="font-mono text-2xs text-subtle">
            Every project, as one board
          </p>
        </div>

        <Bench projects={projects} />
      </Container>
    </section>
  );
}
