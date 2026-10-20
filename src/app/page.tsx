import Link from "next/link";
import { getFeaturedProjects, getAllPosts } from "@/lib/content";
import { SITE } from "@/lib/site";
import { EngineeringStack } from "@/components/engineering-stack/engineering-stack";
import { ExperienceList } from "@/components/experience-list";
import { PixelField } from "@/components/pixel-field";
import styles from "./page.module.css";

export default function HomePage() {
  const projects = getFeaturedProjects().slice(0, 4);
  const posts = getAllPosts().slice(0, 3);

  return (
    <div className={styles.home}>
      <section className={styles.hero} aria-labelledby="hero-heading">
        <PixelField />
        <div className={`${styles.container} ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <p className={styles.byline}>Computer Engineering · University of Oklahoma</p>
            <h1 id="hero-heading">Tadiwa<br />Mandava<span className={styles.accent}>.</span></h1>
            <p className={styles.intro}>
              My work spans RISC-V verification, embedded kernels, storage,
              and language-model inference.
            </p>
            <div className={styles.actions}>
              <a href="#work" className={styles.primaryButton}>Projects</a>
              <Link href="/resume" className={styles.secondaryButton}>Résumé</Link>
            </div>
          </div>
          <EngineeringStack />
        </div>
      </section>

      <section id="work" className={styles.workSection} aria-labelledby="work-heading">
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <h2 id="work-heading">Selected projects</h2>
            <Link href="/projects" className={styles.textLink}>All projects</Link>
          </div>
          {projects.length > 0 ? (
            <ol className={styles.projectList}>
              {projects.map((project) => (
                <li key={project.slug}>
                  <Link href={`/projects/${project.slug}`} className={styles.projectRow}>
                    <div>
                      <h3>{project.title}</h3>
                      <span className={styles.languages}>{project.languages.join(" / ")}</span>
                    </div>
                    <p>{project.pitch}</p>
                  </Link>
                </li>
              ))}
            </ol>
          ) : <p className={styles.empty}>No project writeups are published yet.</p>}
        </div>
      </section>

      <section className={styles.experienceSection} aria-labelledby="experience-heading">
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <h2 id="experience-heading">Experience</h2>
          </div>
          <ExperienceList />
        </div>
      </section>

      <section id="lab" className={styles.labSection} aria-labelledby="lab-heading">
        <div className={styles.container}>
          <h2 id="lab-heading" className={styles.labHeading}><Link href="/lab">Lab</Link></h2>
          <div className={styles.demos}>
            <article>
              <p className={styles.languages}>C++ / WebAssembly</p>
              <h3><Link href="/lab/inference">Language-model inference</Link></h3>
              <p>A C++ transformer engine compiled to WebAssembly, with local generation and source retrieval.</p>
            </article>
            <article>
              <p className={styles.languages}>Rust / WebAssembly</p>
              <h3><Link href="/lab/search">Vector search</Link></h3>
              <p>A Rust HNSW index with recall and query timings measured against an exhaustive scan.</p>
            </article>
          </div>
        </div>
      </section>

      {posts.length > 0 && (
        <section className={styles.writingSection} aria-labelledby="writing-heading">
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 id="writing-heading">Writing</h2>
              <Link href="/writing" className={styles.textLink}>All posts</Link>
            </div>
            <ul className={styles.postList}>
              {posts.map((post) => (
                <li key={post.slug}>
                  <Link href={`/writing/${post.slug}`}>
                    <time dateTime={post.published}>{post.published}</time>
                    <h3>{post.title}</h3>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className={styles.contactSection} aria-labelledby="contact-heading">
        <div className={styles.container}>
          <h2 id="contact-heading">Contact</h2>
          <a href={`mailto:${SITE.email}`} className={styles.email}>{SITE.email}</a>
          <div className={styles.contactLinks}>
            <a href={SITE.github} target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a>
            <a href={SITE.linkedin} target="_blank" rel="noreferrer">LinkedIn <span aria-hidden="true">↗</span></a>
          </div>
        </div>
      </section>
    </div>
  );
}
