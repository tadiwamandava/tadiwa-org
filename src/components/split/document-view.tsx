import type { Project } from "@/lib/content/schema";
import { SITE } from "@/lib/site";

/**
 * The page as a machine receives it.
 *
 * Not a nostalgia costume. This is close to what a crawler, an ATS parser and
 * a screen reader get from this site: headings in order, a list of links,
 * text. The styling is the browser's own defaults with almost nothing added,
 * because that is the point. Someone dragging the seam is not looking at "an
 * old website"; they are looking at the same markup with the design off.
 *
 * The site has claimed in prose since its first commit that the canvas board
 * is an enhancement over semantic HTML. This is that claim, checkable by
 * dragging.
 *
 * aria-hidden and inert because the designed half carries the same links.
 * Without them every link is announced twice and sits in the tab order twice.
 */
export function DocumentView({ projects }: { projects: Project[] }) {
  return (
    <div className="doc-view" aria-hidden="true" inert>
      <h1>{SITE.name}</h1>
      <p>{SITE.role}</p>
      <hr />
      <h2>Projects</h2>
      <ul>
        {projects.map((p) => (
          <li key={p.slug}>
            <a href={`/projects/${p.slug}`}>{p.title}</a>
            <br />
            {p.pitch}
          </li>
        ))}
      </ul>
      <h2>Lab</h2>
      <ul>
        <li><a href="/lab/inference">A language model running in this tab</a></li>
        <li><a href="/lab/search">Vector search, client-side</a></li>
      </ul>
      <h2>Elsewhere</h2>
      <ul>
        <li><a href={SITE.github}>GitHub</a></li>
        <li><a href={SITE.linkedin}>LinkedIn</a></li>
        <li><a href={`mailto:${SITE.email}`}>{SITE.email}</a></li>
      </ul>
    </div>
  );
}
