import Link from "next/link";
import { Container, SectionHeading } from "@/components/ui";
import { ProjectCard } from "@/components/project-card";
import { PcbHero } from "@/components/pcb-hero";
import { getFeaturedProjects, getAllProjects, getAllPosts } from "@/lib/content";
import { SITE } from "@/lib/site";

export default function HomePage() {
  const featured = getFeaturedProjects();
  const fallback = featured.length > 0 ? featured : getAllProjects().slice(0, 6);
  const posts = getAllPosts().slice(0, 3);

  return (
    <>
      {/* ---- hero -----------------------------------------------------------
          No greeting, no "passionate developer". A screener has ~30 seconds and
          spends them deciding whether this person does hard things. Lead with
          the specific claim and let the projects underneath prove it. */}
      <section className="border-b border-border">
        <Container wide className="py-20 sm:py-28">
          <div className="max-w-3xl">
            <p className="font-mono text-xs tracking-[0.14em] text-accent uppercase">
              {SITE.role}
            </p>

            <h1 className="mt-5 font-display text-display leading-[1.02] tracking-tight">
              I build across the
              <br />
              hardware/software boundary.
            </h1>

            <p className="mt-7 max-w-2xl text-xl leading-relaxed text-muted">
              Storage engines, RTOS kernels, RISC-V cores, and the
              verification rigs that prove them correct. The layer I care about
              is where software stops being an abstraction and starts being a
              voltage.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href="/projects"
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover"
              >
                See the work
              </Link>
              <Link
                href="/resume"
                className="text-sm text-muted underline decoration-border underline-offset-4 transition-colors hover:text-accent"
              >
                Résumé
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* ---- currently building --------------------------------------------
          Recruiters track recency. Saying what is in flight, with the honest
          "in progress" framing, beats a page of only-finished work. */}
      <section className="border-b border-border bg-surface">
        <Container wide className="py-4">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-mono text-2xs tracking-[0.14em] text-subtle uppercase">
              Now
            </span>
            <span className="text-muted">Building {SITE.nowBuilding}.</span>
          </p>
        </Container>
      </section>

      {/* ---- the bench ------------------------------------------------------
          The projects as one printed circuit board. Progressive enhancement:
          this renders a server-side <ul> of project links, and only layers a
          hand-written Canvas2D board over it once the chunk has loaded on a
          wide-enough viewport. See src/components/pcb-hero.tsx. */}
      <PcbHero />

      <Container wide className="py-16">
        <SectionHeading action={{ href: "/projects", label: "All projects" }}>
          Selected work
        </SectionHeading>

        {fallback.length === 0 ? (
          <EmptyState
            what="projects"
            hint="Add an .mdx file to content/projects/. The schema in src/lib/content/schema.ts describes every field."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fallback.map((project) => (
              <ProjectCard key={project.slug} project={project} />
            ))}
          </div>
        )}
      </Container>

      {posts.length > 0 && (
        <Container wide className="pb-20">
          <SectionHeading action={{ href: "/writing", label: "All writing" }}>
            Writing
          </SectionHeading>
          <ul className="divide-y divide-border border-y border-border">
            {posts.map((post) => (
              <li key={post.slug}>
                <Link
                  href={`/writing/${post.slug}`}
                  className="group flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8"
                >
                  <span className="font-display text-lg transition-colors group-hover:text-accent">
                    {post.title}
                  </span>
                  <time
                    dateTime={post.published}
                    className="shrink-0 font-mono text-xs text-subtle tabular-nums"
                  >
                    {post.published}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      )}
    </>
  );
}

function EmptyState({ what, hint }: { what: string; hint: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border-strong p-10 text-center">
      <p className="text-muted">No {what} yet.</p>
      <p className="mx-auto mt-2 max-w-md font-mono text-xs leading-relaxed text-subtle">
        {hint}
      </p>
    </div>
  );
}
