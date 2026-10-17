import Link from "next/link";
import { getFeaturedProjects, getAllProjects, getAllPosts } from "@/lib/content";
import { SITE } from "@/lib/site";
import { EngineeringStack } from "@/components/engineering-stack/engineering-stack";
import styles from "./page.module.css";

export default function HomePage() {
  const all = getAllProjects();
  const featured = getFeaturedProjects();
  const projects = [
    ...featured,
    ...all.filter((project) => !featured.some((item) => item.slug === project.slug)),
  ].slice(0, 6);
  const posts = getAllPosts().slice(0, 3);

  return (
    <div className={styles.home}>
      <section className={styles.hero} aria-labelledby="hero-heading">
        <div className={`${styles.container} ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <p className={styles.byline}>Tadiwa Mandava · Computer Engineering at OU</p>
            <h1 id="hero-heading">I build what’s<br /><em>underneath.</em></h1>
            <p className={styles.intro}>
              I’m a junior at the University of Oklahoma. I write storage engines,
              real-time kernels, and inference code, and design the hardware they run on.
            </p>
            <div className={styles.actions}>
              <a href="#work" className={styles.primaryButton}>View projects</a>
              <Link href="/resume" className={styles.secondaryButton}>Read my résumé</Link>
            </div>
            <p className={styles.currentWork}>
              <span>Currently working on</span>
              The retrieval and inference stack in <Link href="/lab">this site’s lab</Link>.
            </p>
          </div>
          <EngineeringStack />
        </div>
      </section>

      <section id="work" className={styles.workSection} aria-labelledby="work-heading">
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="work-heading">Selected projects</h2>
              <p>Implementation notes, design decisions, and the bugs that took the most work.</p>
            </div>
            <Link href="/projects" className={styles.textLink}>Filter by language or domain</Link>
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
                    <span className={styles.readProject}>Read project</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : <p className={styles.empty}>No project writeups are published yet.</p>}
        </div>
      </section>

      <section id="lab" className={styles.labSection} aria-labelledby="lab-heading">
        <div className={`${styles.container} ${styles.labLayout}`}>
          <div className={styles.labIntro}>
            <h2 id="lab-heading">Run the code<br />in your browser.</h2>
            <p>The lab lets you inspect the results yourself. Model downloads start only when you request them.</p>
            <Link href="/lab" className={styles.textLink}>Read about the demos</Link>
          </div>
          <div className={styles.demos}>
            <article>
              <p className={styles.languages}>C++ / WebAssembly</p>
              <h3>Language-model inference</h3>
              <p>Ask a question, inspect the retrieved sources, and watch a C++ forward pass generate tokens. Compare local models with the hosted option when available.</p>
              <Link href="/lab/inference" className={styles.primaryButton}>Open inference demo</Link>
            </article>
            <article>
              <p className={styles.languages}>Rust / WebAssembly</p>
              <h3>Vector search</h3>
              <p>Query an HNSW graph of this site. Change the search parameters and compare its results and timing with an exhaustive scan.</p>
              <Link href="/lab/search" className={styles.secondaryButton}>Open search demo</Link>
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
          <p>For questions about a project or opportunities to work together.</p>
          <div className={styles.contactLinks}>
            <a href={SITE.github} target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a>
            <a href={SITE.linkedin} target="_blank" rel="noreferrer">LinkedIn <span aria-hidden="true">↗</span></a>
          </div>
        </div>
      </section>
      <footer className={styles.footer}>
        <div className={styles.container}>
          <span>© {new Date().getFullYear()} {SITE.name}</span>
          <a href="#hero-heading">Back to top</a>
        </div>
      </footer>
    </div>
  );
}
