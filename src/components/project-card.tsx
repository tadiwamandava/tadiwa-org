import Link from "next/link";
import type { Project } from "@/lib/content/schema";
import { StatusPill, MetricStat } from "./ui";

/**
 * The 30-second unit.
 *
 * Ordering is deliberate: status → title → pitch → numbers → stack. A screener
 * scanning a grid reads titles first and pitches second, so the pitch has to
 * carry the difficulty on its own. Metrics sit below because they only mean
 * something once you know what the thing is.
 */
export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className="group relative flex flex-col rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong">
      <div className="flex items-center gap-3">
        <StatusPill status={project.status} />
      </div>

      <h3 className="mt-3 font-display text-xl leading-snug">
        {/* Whole-card click target via ::after, but the anchor text stays the
            title so the link makes sense read out of context. */}
        <Link
          href={`/projects/${project.slug}`}
          className="after:absolute after:inset-0 after:content-['']"
        >
          {project.title}
        </Link>
      </h3>

      <p className="mt-2 text-sm leading-relaxed text-muted">{project.pitch}</p>

      {project.metrics.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
          {project.metrics.map((m) => (
            <MetricStat key={m.label} {...m} />
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-1.5 pt-4 border-t border-border">
        {project.languages.slice(0, 4).map((lang) => (
          <span
            key={lang}
            className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-muted"
          >
            {lang}
          </span>
        ))}
      </div>
    </article>
  );
}
