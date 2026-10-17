import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui";
import { Mdx } from "@/components/mdx";
import { getAllPosts, getPost, getProject } from "@/lib/content";

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(
  props: PageProps<"/writing/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      publishedTime: post.published,
      modifiedTime: post.updated,
    },
  };
}

export default async function PostPage(props: PageProps<"/writing/[slug]">) {
  const { slug } = await props.params;
  const post = getPost(slug);
  if (!post) notFound();

  const project = post.project ? getProject(post.project) : undefined;

  return (
    <Container className="py-14">
      <Link
        href="/writing"
        className="text-2xs text-subtle transition-colors hover:text-accent"
      >
        ← Writing
      </Link>

      <header className="mt-6 border-b border-border pb-8">
        <h1 className="font-display text-4xl leading-tight tracking-tight">
          {post.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          {post.description}
        </p>
        <p className="mt-5 flex flex-wrap items-center gap-x-3 font-mono text-xs text-subtle">
          <time dateTime={post.published} className="tabular-nums">
            {post.published}
          </time>
          <span aria-hidden>·</span>
          <span>{post.readingTimeMinutes} min read</span>
          {project && (
            <>
              <span aria-hidden>·</span>
              <Link
                href={`/projects/${project.slug}`}
                className="text-accent hover:underline"
              >
                {project.title}
              </Link>
            </>
          )}
        </p>
      </header>

      <div className="prose mt-10">
        <Mdx source={post.body} />
      </div>
    </Container>
  );
}
