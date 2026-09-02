import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui";
import { getAllProjects, getAllPosts } from "@/lib/content";

export const metadata: Metadata = {
  title: "Colophon",
  description:
    "How this site is built: one typed corpus feeding four consumers, a Rust search index compiled to WebAssembly, a contrast checker that fails the build, build-time syntax highlighting, and the parts I would do differently.",
};

/* ============================================================================
   /colophon

   This page is a portfolio piece, not a footnote. It gets the same treatment as
   a project writeup: name the decision, name what it beat, show the
   measurement. A colophon that only lists dependencies is a
   package.json with nicer type.

   Everything asserted here is checkable against the repository. Where something
   is scheduled rather than shipped, it says so.
   ========================================================================= */

export default function ColophonPage() {
  // Counted at build, not typed in. A colophon that describes a corpus should
  // not be the one file that goes stale about its size.
  const projectCount = getAllProjects().length;
  const postCount = getAllPosts().length;

  return (
    <article>
      <header className="border-b border-border bg-surface">
        <Container className="py-14">
          <p className="font-mono text-2xs tracking-[0.14em] text-subtle uppercase">
            Colophon
          </p>

          <h1 className="mt-5 font-display text-4xl leading-tight tracking-tight">
            The tools get the same treatment as the projects.
          </h1>

          <p className="mt-5 max-w-2xl text-xl leading-relaxed text-muted">
            This site is a portfolio piece, not a container for one. Below: what
            it is built from, why each piece beat the thing it replaced, the two
            checks that can fail the build, and the parts I would do
            differently.
          </p>
        </Container>
      </header>

      <Container className="py-14">
        {/* ---- the stack ------------------------------------------------- */}
        <Section label="The stack">
          {/* No top border: the section heading's rule already caps the table,
              and stacking a second hairline 20px below it reads as a mistake. */}
          <dl className="mt-4 divide-y divide-border border-b border-border">
            <StackRow term="Framework">
              Next.js 16, App Router, React Server Components. Turbopack for both
              dev and build.
            </StackRow>
            <StackRow term="Language">
              TypeScript with <Code>strict</Code> on, and route types generated
              by <Code>next typegen</Code> rather than hand-written.
            </StackRow>
            <StackRow term="Styling">
              Tailwind v4 sitting on a CSS custom-property token layer. No
              component references a hex value.
            </StackRow>
            <StackRow term="Content">
              MDX files on disk, front-matter parsed by gray-matter and validated
              by Zod. {projectCount} projects, {postCount}{" "}
              {postCount === 1 ? "post" : "posts"} today.
            </StackRow>
            <StackRow term="Search">
              An HNSW index I wrote in Rust, compiled to WebAssembly, over a
              BM25 lexical index that answers first. Semantic is opt-in,
              because the embedding model is 22 MB. Detail below.
            </StackRow>
            <StackRow term="Code samples">
              Shiki through rehype-pretty-code, at build time.
            </StackRow>
            <StackRow term="Type">
              Saira for headings, self-hosted by <Code>next/font</Code>. Body
              and mono are the system stack, so one file is downloaded.
            </StackRow>
            <StackRow term="Gates">
              Types, lint, WCAG contrast, corpus schema, search quality,
              build, in that order, cheapest first.
            </StackRow>
            <StackRow term="Not here">
              No CMS, no database, no analytics, no cookies, and no request to a
              third-party origin on any page load.
            </StackRow>
          </dl>

          <div className="prose mt-8">
            <p>
              The through-line is that a personal site is a document, and almost
              nothing about a document benefits from being an application.
              Server Components let me act on that literally: the HTML arrives
              finished, and the only JavaScript that reaches the browser on a
              typical page is a print button on the résumé. Not &ldquo;a small
              bundle&rdquo;. One button.
            </p>
            <p>
              What that ruled out was the default answer, which is a
              client-rendered app that fetches its own content and then re-renders
              text that never changes. The trade is real and I want to name it:
              interactive work has to be deliberately opted into rather than
              assumed, and the pieces of this site that genuinely need a
              client, meaning the WebAssembly demos in the{" "}
              <Link href="/lab">Lab</Link>, have to be built as islands. That is
              more work than starting from an app. It is also why every other
              page can be a file.
            </p>
            <p>
              The token layer deserves its own sentence, because it is load-bearing
              for something later on this page. Every colour on this site is
              defined once, as a custom property, in one stylesheet. Components
              use semantic names like <Code>bg-surface</Code>,{" "}
              <Code>text-muted</Code> and <Code>border-border-strong</Code>,
              never a literal. That is
              not tidiness. It is the precondition for a script being able to
              read the palette and tell me it is wrong.
            </p>
          </div>
        </Section>

        {/* ---- the corpus -------------------------------------------------- */}
        <Section label="One corpus, four consumers">
          <div className="prose mt-5">
            <p>
              All the writing on this site is MDX in <Code>content/</Code>,
              validated on the way in by a Zod schema in{" "}
              <Code>src/lib/content/schema.ts</Code>. That schema is the most
              consequential file in the repository, and the reason is in its
              header: four separate things read the corpus, and they have
              different tolerances for a missing field.
            </p>
            <ul>
              <li>
                <strong>Project pages</strong> render every field. Live.
              </li>
              <li>
                <strong>The résumé</strong> selects and orders{" "}
                <Code>resumeBullets</Code>. Live; it is the page next door.
              </li>
              <li>
                <strong>A client-side vector index</strong> chunks the prose
                fields for semantic search. Live; press <Code>⌘K</Code>
                anywhere on the site.
              </li>
              <li>
                <strong>A tailoring feature</strong> will let a visitor say what
                role they are hiring for and get the work reordered for it.
                Scheduled.
              </li>
            </ul>
            <p>
              Three of those four exist today. Tailoring is the one that
              doesn&rsquo;t, which still makes part of the schema&rsquo;s
              strictness speculative. It is also the reason for the rest of
              it: the schema had to assume a reader with no judgment of its own
              before any of the other three consumers existed to prove the
              assumption out. The vector index is the newest evidence that the
              bet was reasonable. It reads the same required fields the résumé
              does, indexes them, and never once needed a fifth field added on
              its behalf.
            </p>

            <h3>Why the schema is strict</h3>
            <p>
              A language model asked to <em>write about this project</em> will
              produce a number. It will be plausible, it will be specific, and it
              will be invented, on my behalf, to a
              recruiter, in a tab I am not looking at. A model asked to{" "}
              <em>pick three of these seven pre-written sentences</em> cannot do
              that. The schema is the containment boundary: the corpus is the
              complete set of facts anything on this site is allowed to assert.
            </p>
            <p>
              Two fields carry most of that weight, and both are required where
              other portfolios would make them optional.
            </p>
            <p>
              Every benchmark must name its <Code>hardware</Code>, its{" "}
              <Code>methodology</Code>, and its <Code>gapAnalysis</Code>. The
              first two are obvious once stated: a throughput number without the
              machine and the repetition count is not a measurement, it is a
              claim, and it is the first thing an interviewer will ask you to
              reproduce. The third is the interesting one. <Code>gapAnalysis</Code>{" "}
              is the paragraph explaining why the reference implementation is
              still faster than mine. Making it required means a benchmark cannot
              ship as a victory lap. If I beat Redis at something, the schema
              forces me to write down what Redis is doing that I am not.
              Nine times out of ten that is the paragraph revealing the
              benchmark measured the wrong thing.
            </p>
            <p>
              Every design decision must name a <Code>rejected</Code> alternative.
              A decision with no discarded option is not a decision, it is a
              default that got written up in the past tense. Requiring the field
              means that when I sit down to document a choice, I have to be able
              to say what else was on the table. If I cannot, I learn that I
              never actually chose. This is the field that is hardest to fill in
              honestly and the one interviewers respond to most.
            </p>
            <p>
              The corpus also gets its own gate. <Code>npm run check:content</Code>{" "}
              parses every MDX file against the schema without booting Next, in
              about a second, so it can sit in a pre-commit hook where a full
              build cannot. It also reports every{" "}
              <Code>TODO</Code> and <Code>CONFIRM</Code> marker still in the
              corpus, which is how the placeholders on the{" "}
              <Link href="/resume">résumé</Link> stay visible instead of quietly
              becoming permanent.
            </p>
          </div>
        </Section>

        {/* ---- search -------------------------------------------------------- */}

        {/* ---- inference ---------------------------------------------------- */}

        {/* ---- contrast gate ------------------------------------------------ */}
        <Section label="Accessibility as a build gate">
          <div className="prose mt-5">
            <p>
              <Code>scripts/check-contrast.ts</Code> reads{" "}
              <Code>src/app/globals.css</Code>, walks the brace structure to pull
              the token block out of it, and computes WCAG contrast for every
              foreground/background pairing the design actually uses. It exits
              non-zero on failure, and it runs in CI ahead of the build. Today
              it clears 27 contrast pairs and 8 perceptual-separation pairs.
            </p>
            <p>
              The design decision worth defending is the parsing. The obvious
              implementation keeps its own copy of the palette in the script,
              which is simpler, faster, and wrong: the first time a colour is
              tweaked in the stylesheet the copy stops matching, and from then on
              the checker cheerfully certifies a theme nobody is shipping. A gate
              that can silently pass the wrong artifact is worse than no gate,
              because a green check you have stopped trusting is a green check you
              have stopped reading. So the script parses the real file, and if the
              token blocks move it fails loudly rather than degrading quietly.
            </p>
            <p>
              It asserts four things: AA body contrast for text; the 3:1
              non-text ratio from WCAG 1.4.11 for anything that identifies a
              control, which is why there are two border tokens and not one;
              that no colour is defined anywhere but bare <Code>:root</Code>,
              which is the structural drift a ratio cannot see; and OKLab
              distance between
              the token pairs that have to stay tellable apart, which contrast
              against a background cannot catch. Two colours can both sit at
              5.5:1 on the page and still be the same colour.
            </p>
            <p>
              On its first run it failed three checks, all of them on colours I
              had personally looked at and approved. Two were tertiary text at
              4.14:1. The third was the token for control borders, sitting at
              1.88:1 against a 3:1 requirement, which on my screen read as a
              tasteful hairline and to someone else was simply not there. The fix
              took ten minutes; noticing was the part I could not do.{" "}
              <Link href="/writing/build-gates-that-argue-back">
                The full writeup is here
              </Link>
              .
            </p>
          </div>
        </Section>

        {/* ---- typography --------------------------------------------------- */}

        {/* ---- highlighting -------------------------------------------------- */}

        {/* ---- hindsight ----------------------------------------------------- */}
        <Section label="What I'd do differently">
          <div className="prose mt-5">
            <p>
              Same section as every project page, same rules. These are real, they
              are current, and none of them is a humblebrag.
            </p>
          </div>

          <ol className="mt-6 space-y-7">
            <Regret n={1} title="The gates run in CI, not in the build">
              <Code>npm run build</Code> is exactly <Code>next build</Code>. The
              contrast and content checks live in <Code>npm run check</Code> and
              in the GitHub Actions workflow, which covers anything that reaches{" "}
              <Code>main</Code> and nothing about a deploy triggered from
              a laptop. I wrote a page arguing that a gate is only worth having if
              it can fail, and then left the two most interesting gates off the
              path that actually ships bytes. A <Code>prebuild</Code> script is a
              one-line fix I have not made.
            </Regret>


            <Regret n={2} title="Dropping the light theme deleted a gate as well as a feature">
              The palette used to exist three times: a light block, a{" "}
              <Code>prefers-color-scheme</Code> dark block, and a{" "}
              <Code>[data-theme]</Code> dark block that had to stay byte-identical
              to it. The contrast checker asserted that parity, and that
              assertion was doing real work, because a drift meant the OS
              preference and the toggle rendered different sites.
              <br />
              <br />
              There is one block now and nothing to compare, so the check was
              removed rather than left passing vacuously. What replaced it is
              weaker and worth naming: a scan for colour tokens defined anywhere
              other than bare <Code>:root</Code>. It catches the structural
              mistake, not a value drift, because with one block there is no
              second value to drift from. Verified by adding a stray{" "}
              <Code>@media</Code> block and watching it fail.
            </Regret>


          </ol>
        </Section>

        <p className="mt-14 border-t border-border pt-6 text-sm leading-relaxed text-subtle">
          Everything above is checkable against the repository. If something here
          describes the site more generously than the code does, that is a bug in
          this page, and I would like to know about it.
        </p>
      </Container>
    </article>
  );
}

/* ---------------------------------------------------------------------------
   Local primitives. Same visual language as the project pages: mono section
   labels over a hairline, prose body underneath.
   ------------------------------------------------------------------------ */

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-14 first:mt-0">
      <h2 className="border-b border-border pb-2 font-mono text-xs tracking-[0.14em] text-muted uppercase">
        {label}
      </h2>
      {children}
    </section>
  );
}

function StackRow({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-x-6 gap-y-1 py-3 sm:flex-row">
      <dt className="w-36 shrink-0 pt-0.5 font-mono text-2xs tracking-[0.1em] text-subtle uppercase">
        {term}
      </dt>
      <dd className="leading-relaxed text-muted">{children}</dd>
    </div>
  );
}

function Regret({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid gap-2">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-subtle tabular-nums">
          {String(n).padStart(2, "0")}
        </span>
        <h3 className="font-display text-lg leading-snug">{title}</h3>
      </div>
      <p className="pl-8 leading-relaxed text-muted">{children}</p>
    </li>
  );
}

/** Inline code that matches the prose block's treatment without needing to be
 *  inside one. */
function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-sm border border-border bg-surface-2 px-1 py-px font-mono text-[0.86em] whitespace-nowrap">
      {children}
    </code>
  );
}
