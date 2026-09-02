import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui";
import { ProjectCard } from "@/components/project-card";
import { ProjectFilter, type ProjectFilterState } from "@/components/project-filter";
import { getAllProjects } from "@/lib/content";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Storage engines, RTOS kernels, RISC-V cores, and the verification environments that prove them correct.",
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProjectsPage(props: PageProps<"/projects">) {
  const rawParams = await props.searchParams;
  const selected: ProjectFilterState = {
    domain: firstParam(rawParams.domain),
    lang: firstParam(rawParams.lang),
  };

  const allProjects = getAllProjects();

  const filtered = allProjects.filter((project) => {
    if (selected.domain && !project.domains.some((d) => d === selected.domain)) {
      return false;
    }
    if (selected.lang && !project.languages.includes(selected.lang)) {
      return false;
    }
    return true;
  });

  const hasActiveFilter = Boolean(selected.domain || selected.lang);

  return (
    <Container wide className="py-16">
      <header className="max-w-2xl">
        <h1 className="font-display text-4xl tracking-tight">Projects</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          Each one has a writeup: how it works, what I tried that didn&rsquo;t,
          and where the numbers came from.
        </p>
      </header>

      {allProjects.length === 0 ? (
        <p className="mt-12 rounded-lg border border-dashed border-border-strong p-10 text-center text-muted">
          No projects yet. Add an <code>.mdx</code> file to{" "}
          <code>content/projects/</code>.
        </p>
      ) : (
        <>
          <ProjectFilter projects={allProjects} selected={selected} />

          <p className="mt-6 font-mono text-xs text-subtle" aria-live="polite">
            {hasActiveFilter
              ? `${filtered.length} of ${allProjects.length} project${allProjects.length === 1 ? "" : "s"}`
              : `${allProjects.length} project${allProjects.length === 1 ? "" : "s"}`}
          </p>

          {filtered.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-border-strong p-10 text-center">
              <p className="text-muted">
                No projects match this combination of filters.
              </p>
              <Link
                href="/projects"
                className="mt-4 inline-block font-mono text-xs tracking-wide text-accent uppercase underline decoration-dotted underline-offset-4 transition-colors hover:text-text"
              >
                Clear filters
              </Link>
            </div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {filtered.map((project) => (
                <ProjectCard key={project.slug} project={project} />
              ))}
            </div>
          )}
        </>
      )}
    </Container>
  );
}
