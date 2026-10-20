import Link from "next/link";
import type { Project } from "@/lib/content/schema";
import { MetricStat } from "./ui";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="relative grid gap-4 border-b border-border py-7 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:gap-8">
      <div>
        <h2 className="font-sans text-xl font-medium leading-snug">
          <Link href={`/projects/${project.slug}`} className="inline-flex min-h-11 items-center underline decoration-border-strong underline-offset-4 after:absolute after:inset-0 after:content-[''] hover:text-accent">
            {project.title}
          </Link>
        </h2>
        <p className="mt-2 font-mono text-2xs text-subtle">{project.languages.join(" / ")}</p>
      </div>
      <div>
        <p className="text-base leading-relaxed text-muted">{project.pitch}</p>
        {project.metrics.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
            {project.metrics.map((metric) => <MetricStat key={metric.label} {...metric} />)}
          </div>
        )}
      </div>
    </article>
  );
}
