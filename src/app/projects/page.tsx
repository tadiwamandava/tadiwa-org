import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui";
import { ProjectCard } from "@/components/project-card";
import { ProjectFilter, type ProjectFilterState } from "@/components/project-filter";
import { getAllProjects } from "@/lib/content";
import type { Project } from "@/lib/content/schema";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Storage engines, RTOS kernels, RISC-V cores, and the verification environments that prove them correct.",
};

// Same "in-flight floats first" ordering as lib/content/index.ts's sort;
// kept here as display labels only; the filter chip *values* are always
// derived from the corpus, never from this list.
const STATUS_ORDER: Project["status"][] = ["building", "shipped", "planned"];
const STATUS_LABEL: Record<Project["status"], string> = {
  building: "In progress",
  shipped: "Shipped",
  planned: "Planned",
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProjectsPage(props: PageProps<"/projects">) {
  const rawParams = await props.searchParams;
  const selected: ProjectFilterState = {
    domain: firstParam(rawParams.domain),
    lang: firstParam(rawParams.lang),
    status: firstParam(rawParams.status),
  };

  const allProjects = getAllProjects();

  const filtered = allProjects.filter((project) => {
    if (selected.domain && !project.domains.some((d) => d === selected.domain)) {
      return false;
    }
    if (selected.lang && !project.languages.includes(selected.lang)) {
      return false;
    }
    if (selected.status && project.status !== selected.status) {
      return false;
    }
    return true;
  });

  const hasActiveFilter = Boolean(selected.domain || selected.lang || selected.status);

  // Status grouping earns its keep by surfacing in-flight work first, but
  // once someone has already filtered down to one status, a flat grid is
  // clearer than a single lonely group header.
  const groups = selected.status
    ? null
    : STATUS_ORDER.map((status) => ({
        status,
        label: STATUS_LABEL[status],
        projects: filtered.filter((p) => p.status === status),
      }));

  return (
    <Container wide className="py-16">
      <header className="max-w-2xl">
        <h1 className="font-display text-4xl tracking-tight">Projects</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          Architecture, the alternatives I rejected, and the methodology behind
          every number.
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
          ) : groups ? (
            <div className="mt-8 space-y-14">
              {groups.map(
                (group) =>
                  group.projects.length > 0 && (
                    <Group
                      key={group.status}
                      title={group.label}
                      projects={group.projects}
                    />
                  ),
              )}
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

function Group({ title, projects }: { title: string; projects: Project[] }) {
  return (
    <section>
      <h2 className="mb-5 border-b border-border pb-2 font-mono text-xs tracking-[0.14em] text-muted uppercase">
        {title}
        <span className="ml-2 text-subtle tabular-nums">{projects.length}</span>
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {projects.map((project) => (
          <ProjectCard key={project.slug} project={project} />
        ))}
      </div>
    </section>
  );
}
