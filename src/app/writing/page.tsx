import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui";
import { getAllPosts } from "@/lib/content";

export const metadata: Metadata = {
  title: "Writing",
  description:
    "Build logs and postmortems: what the tutorials skip, what the vendors hide, and the numbers.",
};

export default function WritingPage() {
  const posts = getAllPosts();

  return (
    <Container className="py-16">
      <header>
        <h1 className="font-display text-4xl tracking-tight">Writing</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          One post per finished project. What I built, the hardest bug, what
          the tutorials and vendor SDKs leave out, the numbers, and what
          I&rsquo;d do differently.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="mt-12 rounded-lg border border-dashed border-border-strong p-10 text-center text-muted">
          Nothing published yet. The first post lands with the first finished
          project.
        </p>
      ) : (
        <ul className="mt-12 divide-y divide-border border-y border-border">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link href={`/writing/${post.slug}`} className="group block py-6">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8">
                  <h2 className="font-display text-xl transition-colors group-hover:text-accent">
                    {post.title}
                    {post.draft && (
                      <span className="ml-2 font-mono text-2xs tracking-wide text-accent uppercase">
                        draft
                      </span>
                    )}
                  </h2>
                  <time
                    dateTime={post.published}
                    className="shrink-0 font-mono text-xs text-subtle tabular-nums"
                  >
                    {post.published}
                  </time>
                </div>
                <p className="mt-2 max-w-2xl leading-relaxed text-muted">
                  {post.description}
                </p>
                <p className="mt-2 font-mono text-2xs text-subtle">
                  {post.readingTimeMinutes} min read
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
