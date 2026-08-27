import { MDXRemote } from "next-mdx-remote/rsc";
import type { MDXComponents } from "mdx/types";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode, { type Options as PrettyCodeOptions } from "rehype-pretty-code";
import remarkGfm from "remark-gfm";

/* Syntax highlighting happens at BUILD time via Shiki, so the page ships zero
   highlighter JS. Both palettes are emitted as CSS custom properties and the
   theme switch picks between them — see the Shiki block in globals.css. */
const prettyCodeOptions: PrettyCodeOptions = {
  theme: { light: "vitesse-light", dark: "vitesse-dark" },
  keepBackground: false,
  defaultLang: "text",
};

function Callout({
  kind = "note",
  children,
}: {
  kind?: "note" | "warn" | "result";
  children: React.ReactNode;
}) {
  const style = {
    note: "border-border-strong bg-surface",
    warn: "border-accent bg-accent-subtle",
    result: "border-shipped bg-surface",
  }[kind];

  const label = { note: "Note", warn: "Careful", result: "Result" }[kind];

  return (
    <aside className={`my-6 rounded border-l-2 ${style} px-4 py-3`}>
      <p className="mb-1 font-mono text-2xs tracking-[0.12em] text-muted uppercase">
        {label}
      </p>
      <div className="[&>*+*]:mt-2 [&>p]:text-base [&>p]:leading-relaxed">
        {children}
      </div>
    </aside>
  );
}

/** Wraps wide content so it scrolls inside itself instead of breaking the page. */
function ScrollX({ children }: { children: React.ReactNode }) {
  return <div className="scroll-x my-6">{children}</div>;
}

const components: MDXComponents = {
  Callout,
  ScrollX,
  // Tables are the most common source of horizontal page overflow on mobile.
  table: (props) => (
    <div className="scroll-x my-6">
      <table {...props} />
    </div>
  ),
  a: (props) => {
    const href = String(props.href ?? "");
    const external = href.startsWith("http");
    return (
      <a
        {...props}
        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      />
    );
  },
};

export function Mdx({ source }: { source: string }) {
  return (
    <MDXRemote
      source={source}
      components={components}
      options={{
        // Frontmatter is already parsed by gray-matter upstream; MDXRemote
        // would choke on it if we did not strip it there first.
        mdxOptions: {
          remarkPlugins: [remarkGfm],
          rehypePlugins: [
            rehypeSlug,
            [rehypePrettyCode, prettyCodeOptions],
            [
              rehypeAutolinkHeadings,
              {
                behavior: "append",
                properties: { className: ["heading-anchor"], ariaHidden: true, tabIndex: -1 },
                content: { type: "text", value: "#" },
              },
            ],
          ],
        },
      }}
    />
  );
}
