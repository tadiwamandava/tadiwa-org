import Link from "next/link";
import { EXPERIENCE } from "@/lib/resume-data";
import { getProject } from "@/lib/content";
import styles from "./experience-list.module.css";

export function ExperienceList() {
  return (
    <div className={styles.list}>
      {EXPERIENCE.map((entry) => {
        const project = entry.projectSlug ? getProject(entry.projectSlug) : undefined;
        const demo = project?.artifacts.find((artifact) => artifact.kind === "demo");

        return (
          <details key={`${entry.org}-${entry.title}`} className={styles.entry}>
            <summary className={styles.summary}>
              <span className={styles.position}>
                <span className={styles.org}>{entry.org}</span>
                <span className={styles.role}>{entry.title}</span>
              </span>
              <span className={styles.dates}>{entry.start} to {entry.end}</span>
              <span className={styles.indicator} aria-hidden="true" />
            </summary>
            <div className={styles.body}>
              <ul>
                {entry.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
              </ul>
              {project && (
                <div className={styles.links}>
                  <Link href={`/projects/${project.slug}`}>Project writeup</Link>
                  {demo && <a href={demo.href} target="_blank" rel="noreferrer">Live site</a>}
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
