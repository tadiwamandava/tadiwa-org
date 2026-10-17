import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui";
import { Mdx } from "@/components/mdx";
import { BenchmarkChart } from "@/components/benchmark-chart";
import { getAllProjects, getProject, getPostsForProject } from "@/lib/content";

export function generateStaticParams() {
  return getAllProjects().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(
  props: PageProps<"/projects/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const project = getProject(slug);
  if (!project) return {};
  return {
    title: project.title,
    description: project.pitch,
    openGraph: { title: project.title, description: project.pitch },
  };
}

export default async function ProjectPage(props: PageProps<"/projects/[slug]">) {
  const { slug } = await props.params;
  const project = getProject(slug);
  if (!project) notFound();

  const relatedPosts = getPostsForProject(slug);

  return (
    <article>
      {/* ---- header ------------------------------------------------------ */}
      <header className="border-b border-border bg-surface">
        <Container className="py-14">
          <Link
            href="/projects"
            className="text-2xs text-subtle transition-colors hover:text-accent"
          >
            ← Projects
          </Link>

          <h1 className="mt-4 font-display text-4xl leading-tight tracking-tight">
            {project.title}
          </h1>

          <p className="mt-4 max-w-2xl text-xl leading-relaxed text-muted">
            {project.pitch}
          </p>

          {project.artifacts.length > 0 && (
            <ul className="mt-7 flex flex-wrap gap-2">
              {project.artifacts.map((a) => (
                <li key={`${a.kind}-${a.href}`}>
                  <a
                    href={a.href}
                    {...(a.href.startsWith("http")
                      ? { target: "_blank", rel: "noreferrer" }
                      : {})}
                    className="inline-flex items-center gap-1.5 rounded border border-border-strong px-3 py-1.5 text-sm transition-colors hover:border-accent hover:text-accent"
                  >
                    <span className="text-2xs text-subtle">
                      {a.kind}
                    </span>
                    {a.label}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {!project.sourceAvailable && project.sourceNote && (
            <p className="mt-6 max-w-2xl border-l-2 border-border-strong pl-4 text-sm leading-relaxed text-subtle">
              {project.sourceNote}
            </p>
          )}
        </Container>
      </header>

      <Container className="py-14">
        {/* ---- what's hard ----------------------------------------------- */}
        <section className="mb-14">
          <SectionLabel>What&rsquo;s hard about it</SectionLabel>
          <p className="mt-3 text-lg leading-relaxed">{project.hardestThing}</p>
        </section>

        {/* ---- body ------------------------------------------------------- */}
        <div className="prose">
          <Mdx source={project.body} />
        </div>

        {/* ---- benchmarks -------------------------------------------------
            Rendered from structured data, never prose. Hardware, methodology
            and the honest gap paragraph are schema-required, so a chart cannot
            ship without the conditions that produced it. */}
        {project.benchmarks.length > 0 && (
          <section className="mt-16">
            <SectionLabel>Benchmarks</SectionLabel>
            <div className="mt-5 space-y-10">
              {project.benchmarks.map((set) => (
                <BenchmarkChart key={set.title} set={set} />
              ))}
            </div>
          </section>
        )}

        {/* ---- decisions --------------------------------------------------
            §2.2 item 5. Every entry names the alternative that was rejected,
            because a decision without a discarded option is just a default. */}
        {project.decisions.length > 0 && (
          <section className="mt-16">
            <SectionLabel>Design decisions</SectionLabel>
            <ol className="mt-5 space-y-8">
              {project.decisions.map((d, i) => (
                <li key={d.made} className="grid gap-2">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xs text-subtle tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-display text-lg leading-snug">
                      {d.made}
                      {d.regret && (
                        <span className="ml-2 align-middle text-2xs text-accent">
                          would revisit
                        </span>
                      )}
                    </h3>
                  </div>
                  <p className="pl-8 text-sm text-subtle">
                    <span className="text-2xs">
                      Rejected
                    </span>
                    <span className="ml-2">{d.rejected}</span>
                  </p>
                  <p className="pl-8 leading-relaxed text-muted">{d.why}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ---- hindsight --------------------------------------------------
            §2.2 item 8: admitting flaws signals seniority. */}
        {project.wouldDoDifferently.length > 0 && (
          <section className="mt-16">
            <SectionLabel>What I&rsquo;d do differently</SectionLabel>
            <ul className="mt-5 space-y-4">
              {project.wouldDoDifferently.map((item) => (
                <li
                  key={item}
                  className="border-l-2 border-border pl-4 leading-relaxed text-muted"
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {relatedPosts.length > 0 && (
          <section className="mt-16">
            <SectionLabel>Written up</SectionLabel>
            <ul className="mt-5 space-y-2">
              {relatedPosts.map((post) => (
                <li key={post.slug}>
                  <Link
                    href={`/writing/${post.slug}`}
                    className="text-accent underline decoration-border underline-offset-4"
                  >
                    {post.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Container>
    </article>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-border pb-2 text-xs text-muted">
      {children}
    </h2>
  );
}
