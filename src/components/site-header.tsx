import Link from "next/link";
import { NAV, SITE } from "@/lib/site";
import { NavLink } from "./nav-link";
import styles from "./site-header.module.css";

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label={`${SITE.name}, home`}>
          <span>tadiwa<span className={styles.dot}>.</span></span>
        </Link>
        <nav aria-label="Main" className={styles.nav}>
          <ul>
            {NAV.map((item) => <li key={item.href}><NavLink href={item.href}>{item.label}</NavLink></li>)}
            <li><NavLink href="/writing">Writing</NavLink></li>
          </ul>
        </nav>
        <a href={`mailto:${SITE.email}`} className={styles.contact}>Email Tadiwa</a>
      </div>
    </header>
  );
}
