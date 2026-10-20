import Link from "next/link";
import { NAV, SITE } from "@/lib/site";
import { getAllPosts } from "@/lib/content";
import { NavLink } from "./nav-link";
import { PixelField } from "./pixel-field";
import styles from "./site-header.module.css";

export function SiteHeader() {
  const hasWriting = getAllPosts().some((post) => !post.draft);
  return (
    <header className={styles.header}>
      <PixelField />
      <div className={styles.inner}>
        {/* The mark is the pixel field, not the name. Still a link, because
            this is the only way home from every other page and a logo-position
            click going home is a convention people use without reading. The
            accessible name carries what the pixels cannot say. */}
        <Link href="/" className={styles.brand} aria-label={`${SITE.name}, home`}>
          <span className={styles.mark} aria-hidden="true" />
        </Link>
        <nav aria-label="Main" className={styles.nav}>
          <ul>
            {NAV.map((item) => <li key={item.href}><NavLink href={item.href}>{item.label}</NavLink></li>)}
            {hasWriting && <li><NavLink href="/writing">Writing</NavLink></li>}
          </ul>
        </nav>
        <a href={`mailto:${SITE.email}`} className={styles.contact}>Email</a>
      </div>
    </header>
  );
}
