/**
 * Internal link gate.
 *
 * Static analysis, deliberately: it resolves every internal href in the source
 * against the routes that actually exist, without booting a server. That means
 * it runs in a second, needs no free port, and — unlike crawling — also catches
 * dead links on pages a crawler would never reach because the link into them is
 * itself broken.
 *
 * The bug this exists to prevent is the quiet one: a nav item or a writeup
 * cross-reference pointing at a route that was renamed or never built. Nothing
 * fails, nothing logs, and a recruiter following it lands on a 404.
 *
 * Run: npm run check:links
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, relative } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const APP = join(ROOT, "src", "app");
const CONTENT = join(ROOT, "content");

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Route paths implied by the App Router file layout. */
function discoverRoutes(): { staticRoutes: Set<string>; dynamic: string[] } {
  const staticRoutes = new Set<string>();
  const dynamic: string[] = [];

  for (const file of walk(APP)) {
    const base = file.split("/").pop() ?? "";
    if (base !== "page.tsx" && base !== "page.ts") continue;

    const segments = relative(APP, dirname(file))
      .split("/")
      .filter((s) => s && s !== ".")
      // Route groups (folder) do not appear in the URL.
      .filter((s) => !(s.startsWith("(") && s.endsWith(")")));

    const route = "/" + segments.join("/");
    const normalised = route === "/" ? "/" : route.replace(/\/$/, "");

    if (normalised.includes("[")) dynamic.push(normalised);
    else staticRoutes.add(normalised);
  }
  return { staticRoutes, dynamic };
}

/** Slugs that fill the dynamic segments. */
function contentSlugs(dir: string): string[] {
  const full = join(CONTENT, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

interface Finding {
  file: string;
  line: number;
  href: string;
}

function run(): number {
  const { staticRoutes, dynamic } = discoverRoutes();

  const concrete = new Set(staticRoutes);
  for (const pattern of dynamic) {
    // Only two dynamic route families exist; both are backed by content/.
    if (pattern.startsWith("/projects/"))
      for (const s of contentSlugs("projects")) concrete.add(`/projects/${s}`);
    if (pattern.startsWith("/writing/"))
      for (const s of contentSlugs("writing")) concrete.add(`/writing/${s}`);
  }

  // Metadata routes have no page.tsx but are real URLs.
  for (const extra of ["/sitemap.xml", "/robots.txt"]) concrete.add(extra);

  const sources = [
    ...walk(join(ROOT, "src")).filter((f) => /\.(tsx|ts)$/.test(f)),
    ...walk(CONTENT).filter((f) => f.endsWith(".mdx")),
  ];

  const broken: Finding[] = [];
  const seen = new Set<string>();

  for (const file of sources) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        // href="/x" and href={`/x/${y}`} — the template form is skipped, since
        // its value is not knowable statically.
        // Template-literal hrefs — href={`/projects/${slug}`}. The slug is not
        // knowable statically, but the PREFIX is, and a mistyped prefix
        // (/project/ for /projects/) is exactly the typo that renders a whole
        // page of dead links while every check still passes.
        for (const m of line.matchAll(/href=\{`(\/[a-zA-Z0-9_\-\/]*?)\$\{/g)) {
          const prefix = m[1];
          seen.add(prefix + "*");
          const matches = [...dynamic, ...staticRoutes].some(
            (r) => r === prefix.replace(/\/$/, "") || r.startsWith(prefix),
          );
          if (!matches) {
            broken.push({ file: relative(ROOT, file), line: i + 1, href: prefix + "${…}" });
          }
        }

        for (const m of line.matchAll(/href=(?:"|')(\/[^"'#?]*)(?:"|')/g)) {
          const href = m[1].replace(/\/$/, "") || "/";
          seen.add(href);
          // Asset paths are not routes.
          if (/\.(png|jpe?g|svg|webp|ico|pdf|txt|xml|woff2?)$/.test(href)) continue;
          if (!concrete.has(href)) {
            broken.push({ file: relative(ROOT, file), line: i + 1, href });
          }
        }
      });
  }

  console.log(
    `\n  ${concrete.size} routes resolvable · ${seen.size} distinct internal hrefs referenced`,
  );

  if (broken.length > 0) {
    console.error(`\n  ${broken.length} broken internal link(s):\n`);
    for (const b of broken) {
      console.error(`  ✗ ${b.href}`);
      console.error(`      ${b.file}:${b.line}`);
    }
    console.error("");
    return 1;
  }

  console.log(`\n  PASSED — every internal link resolves.\n`);
  return 0;
}

process.exit(run());
