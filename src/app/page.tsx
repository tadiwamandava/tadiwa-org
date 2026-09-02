import Link from "next/link";
import { Container, PageSection } from "@/components/ui";
import { ProjectCard } from "@/components/project-card";
import { PcbHero } from "@/components/pcb-hero";
import { SocialLinks } from "@/components/social-links";
import { getFeaturedProjects, getAllProjects, getAllPosts } from "@/lib/content";
import { SITE } from "@/lib/site";

/**
 * The home page is the index of everything.
 *
 * Every section here has a full route behind it. That is deliberate: a reader
 * who scrolls once should reach the end knowing what is on the site, and a
 * reader who wants depth follows the link at the section heading. The routes
 * are not decoration either. A single page cannot be crawled per topic, cannot
 * be deep-linked in an application, and cannot be parsed by an ATS as separate
 * documents, so the sections summarise and the routes carry the detail.
 */

const DEMOS = [
  {
    href: "/lab/inference",
    title: "A language model, in your tab",
    blurb:
      "SmolLM2-135M running on a forward pass I wrote in C++. It declines when the sources do not cover your question.",
    meta: "C++ · WebAssembly · 25 tok/s",
  },
  {
    href: "/lab/search",
    title: "Vector search, client-side",
    blurb:
      "An HNSW graph I wrote in Rust, searching this site in your tab. Recall measured live against a brute-force scan.",
    meta: "Rust · WebAssembly · 43 KB",
  },
];

export default function HomePage() {
  const featured = getFeaturedProjects();
  const projects = (featured.length > 0 ? featured : getAllProjects()).slice(0, 4);
  const posts = getAllPosts().slice(0, 3);

  return (
    <Container wide className="pb-24">
      {/* ---- hero ---------------------------------------------------------
          No greeting and no "passionate developer". A screener has about
          thirty seconds and spends them deciding whether this person does
          hard things, so the specific claim goes first and everything below
          is evidence for it. */}
      <section className="py-16 sm:py-24">
        <p className="font-mono text-xs tracking-[0.14em] text-accent uppercase">
          {SITE.role}
        </p>

        <h1 className="mt-5 max-w-4xl font-display text-display leading-[1.02] tracking-tight">
          I build across the hardware/software boundary.
        </h1>

        <p className="mt-7 max-w-3xl text-xl leading-relaxed text-muted">
          Storage engines, RTOS kernels, RISC-V cores, and the verification rigs
          that prove them correct. The layer I care about is where software
          stops being an abstraction and starts being a voltage.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Link
            href="/projects"
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover"
          >
            See the work
          </Link>
          <Link
            href="/resume"
            className="rounded border border-border-strong px-4 py-2 text-sm text-muted transition-colors hover:text-text"
          >
            Résumé
          </Link>
          <SocialLinks className="sm:hidden" />
        </div>

        <p className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-mono text-2xs tracking-[0.14em] text-subtle uppercase">
            Now
          </span>
          <span className="text-muted">Building {SITE.nowBuilding}.</span>
        </p>
      </section>

      {/* ---- the bench ----------------------------------------------------
          Progressive enhancement. This renders a server-side list of project
          links, and only layers a hand-written Canvas2D board over it once the
          chunk has loaded on a wide-enough viewport. */}
      <PcbHero />

      <div className="mt-10 space-y-4 sm:mt-16">
        <PageSection
          id="work"
          title="Selected work"
          lead="Architecture, the alternatives I rejected, and the methodology behind every number."
          action={{ href: "/projects", label: "All projects" }}
        >
          {projects.length === 0 ? (
            <EmptyState
              what="projects"
              hint="Add an .mdx file to content/projects/. The schema in src/lib/content/schema.ts describes every field."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.map((project) => (
                <ProjectCard key={project.slug} project={project} />
              ))}
            </div>
          )}
        </PageSection>

        <PageSection
          id="lab"
          title="Things you can run"
          lead="Claims are cheap. Both of these run in your browser, from source I wrote."
          action={{ href: "/lab", label: "The lab" }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {DEMOS.map((demo) => (
              <article
                key={demo.href}
                className="group relative flex flex-col rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong"
              >
                <p className="font-mono text-2xs tracking-wide text-subtle uppercase">
                  {demo.meta}
                </p>
                <h3 className="mt-3 font-display text-xl leading-snug">
                  <Link href={demo.href} className="after:absolute after:inset-0">
                    {demo.title}
                  </Link>
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{demo.blurb}</p>
              </article>
            ))}
          </div>
        </PageSection>

        {posts.length > 0 && (
          <PageSection
            id="writing"
            title="Writing"
            lead="Mostly post-mortems on things I got wrong and the check that caught it."
            action={{ href: "/writing", label: "All writing" }}
          >
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
          </PageSection>
        )}

        {/* ---- the one centred block ------------------------------------
            The rhythm above is uniformly left-aligned, which is what makes
            this read as an ending rather than another section. */}
        <section id="contact" className="pt-20 text-center sm:pt-28">
          <h2 className="font-display text-3xl tracking-tight sm:text-4xl">
            Looking for a Summer 2027 internship
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-muted">
            Systems, ML infrastructure, and the silicon underneath. The résumé
            is generated from the same writeups linked above, so it cannot drift
            from them.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/resume"
              className="rounded bg-accent px-5 py-2.5 text-sm font-medium text-accent-contrast transition-colors hover:bg-accent-hover"
            >
              Read the résumé
            </Link>
            <Link
              href="/colophon"
              className="rounded border border-border-strong px-5 py-2.5 text-sm text-muted transition-colors hover:text-text"
            >
              How this site is built
            </Link>
          </div>
          <SocialLinks className="mt-8 justify-center" />
        </section>
      </div>
    </Container>
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
