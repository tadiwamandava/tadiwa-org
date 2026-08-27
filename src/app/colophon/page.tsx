import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui";
import { getAllProjects, getAllPosts } from "@/lib/content";

export const metadata: Metadata = {
  title: "Colophon",
  description:
    "How this site is built: one typed corpus feeding four consumers, a contrast checker that fails the build, build-time syntax highlighting, and the parts I would do differently.",
};

/* ============================================================================
   /colophon

   This page is a portfolio piece, not a footnote. It gets the same treatment as
   a project writeup — name the decision, name what it beat, show the
   measurement — because a colophon that only lists dependencies is a
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
            <StackRow term="Code samples">
              Shiki through rehype-pretty-code, at build time, in both themes.
            </StackRow>
            <StackRow term="Type">
              Fraunces for display; IBM Plex Sans and Plex Mono for text and
              numerals. Self-hosted by <Code>next/font</Code>.
            </StackRow>
            <StackRow term="Gates">
              Types, lint, WCAG contrast, corpus schema, build — in that order,
              cheapest first.
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
              typical page is a theme toggle and — on the résumé — a print
              button. Not &ldquo;a small bundle&rdquo;. Those two things.
            </p>
            <p>
              What that ruled out was the default answer, which is a
              client-rendered app that fetches its own content and then re-renders
              text that never changes. The trade is real and I want to name it:
              interactive work has to be deliberately opted into rather than
              assumed, and the pieces of this site that genuinely need a
              client — the WebAssembly demos in the{" "}
              <Link href="/lab">Lab</Link> — have to be built as islands. That is
              more work than starting from an app. It is also why every other
              page can be a file.
            </p>
            <p>
              The token layer deserves its own sentence, because it is load-bearing
              for something later on this page. Every colour on this site is
              defined once, as a custom property, in one stylesheet. Components
              use semantic names — <Code>bg-surface</Code>, <Code>text-muted</Code>,{" "}
              <Code>border-border-strong</Code> — and never a literal. That is
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
                <Code>resumeBullets</Code>. Live — it is the page next door.
              </li>
              <li>
                <strong>A client-side vector index</strong> will chunk the prose
                fields for semantic search. Scheduled; see the{" "}
                <Link href="/lab">Lab</Link>.
              </li>
              <li>
                <strong>A tailoring feature</strong> will let a visitor say what
                role they are hiring for and get the work reordered for it.
                Scheduled.
              </li>
            </ul>
            <p>
              Two of those four do not exist yet, which makes some of the
              schema&rsquo;s strictness speculative. I am fine with that, because
              the fourth consumer is the one that sets the rules for the other
              three.
            </p>

            <h3>Why the schema is strict</h3>
            <p>
              A language model asked to <em>write about this project</em> will
              produce a number. It will be plausible, it will be specific, and it
              will be invented — and it will be invented on my behalf, to a
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
              forces me to write down what Redis is doing that I am not — which,
              nine times out of ten, is the paragraph that reveals the benchmark
              was measuring the wrong thing.
            </p>
            <p>
              Every design decision must name a <Code>rejected</Code> alternative.
              A decision with no discarded option is not a decision, it is a
              default that got written up in the past tense. Requiring the field
              means that when I sit down to document a choice, I have to be able
              to say what else was on the table — and if I cannot, I learn that I
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

        {/* ---- contrast gate ------------------------------------------------ */}
        <Section label="Accessibility as a build gate">
          <div className="prose mt-5">
            <p>
              <Code>scripts/check-contrast.ts</Code> reads{" "}
              <Code>src/app/globals.css</Code>, walks the brace structure to pull
              the three token blocks out of it, and computes WCAG contrast for
              every foreground/background pairing the design actually uses — in
              the light theme and the dark theme both. It exits non-zero on
              failure, and it runs in CI ahead of the build. Today it clears 54
              contrast pairs and 8 perceptual-separation pairs.
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
              byte-for-byte parity between the two dark-theme blocks, since the
              media query and the <Code>data-theme</Code> attribute both have to
              carry the palette and a drift between them means the OS preference
              and the toggle render different sites; and OKLab distance between
              the token pairs that have to stay tellable apart, which contrast
              against a background cannot catch — two colours can both sit at
              5.5:1 on the page and still be the same colour.
            </p>
            <p>
              On its first run it failed three checks, all of them on colours I
              had personally looked at and approved. Two were tertiary text at
              4.14:1. The third was the token for control borders, sitting at
              1.88:1 against a 3:1 requirement — which on my screen read as a
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
        <Section label="Type">
          <div className="prose mt-5">
            <p>
              Three families, each with a job. Fraunces sets display text and
              nothing else — a variable serif with an optical-size axis, chosen
              because a default UI sans has no voice and this site is mostly
              prose asking to be read rather than scanned. IBM Plex Sans sets the
              body. IBM Plex Mono sets code, hardware captures, dates, and every
              number that gets compared to another number.
            </p>
            <p>
              Plex Sans and Plex Mono were drawn as one family, which is the
              whole reason for the pairing: a mono column inside a sans paragraph
              usually announces itself as a foreign object, and these two share
              enough skeleton that it does not. Fraunces is the deliberate
              contrast against both.
            </p>
            <p>
              Tabular figures are on everywhere numbers are compared —
              benchmark tables, the date column on the résumé, project timelines.
              Proportional figures give a column of numbers a ragged left edge,
              and a ragged column of numbers is a column nobody scans. This is one
              CSS rule and it is the difference between a table you read and a
              table you skip.
            </p>
            <p>
              All three are self-hosted through <Code>next/font</Code>: the files
              are fetched at build time and served from this origin, so there is
              no request to a Google domain on any page load and no third party in
              the critical path. The other half of that is layout stability —{" "}
              <Code>next/font</Code> knows the metrics at build, so the fallback
              is matched and nothing reflows when the real face arrives.
            </p>
            <p>
              The cost, honestly stated: three families is a lot of bytes for a
              text site. Fraunces ships as two static cuts rather than the
              variable font, because the variable axes are lovely and this site
              uses the face at about four sizes — the static pair is the smaller
              download for identical rendered output.
            </p>
          </div>
        </Section>

        {/* ---- highlighting -------------------------------------------------- */}
        <Section label="Syntax highlighting, at build time">
          <div className="prose mt-5">
            <p>
              Code blocks are tokenised by Shiki during the rehype pass that
              compiles the MDX, not in the browser. rehype-pretty-code is
              configured with two themes, and instead of baking one palette into
              the markup it emits both as custom properties on every token span —{" "}
              <Code>--shiki-light</Code> and <Code>--shiki-dark</Code>. Three CSS
              rules in the stylesheet decide which one applies, keyed off the same{" "}
              <Code>data-theme</Code> attribute everything else uses.
            </p>
            <p>
              Three things fall out of that. The page ships no highlighter
              JavaScript, so there are no grammar bundles on the wire for content
              that cannot change after build. There is no flash of unhighlighted
              code, because the colours are in the HTML before it is sent.
              And switching themes re-colours code with a CSS variable change
              rather than a re-tokenise, so it happens in the same frame as
              everything else on the page.
            </p>
            <p>
              The alternative was a runtime highlighter, which is the common
              choice and costs a few hundred kilobytes of grammars to do at read
              time what can be done once at build. The one configuration detail
              worth noting is <Code>keepBackground: false</Code>: Shiki themes
              carry their own background colour, and letting it through would
              make code blocks the single place on the site where a colour escapes
              the token layer — and therefore the one place the contrast checker
              could not see.
            </p>
          </div>
        </Section>

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
              <Code>main</Code> — and covers nothing about a deploy triggered from
              a laptop. I wrote a page arguing that a gate is only worth having if
              it can fail, and then left the two most interesting gates off the
              path that actually ships bytes. A <Code>prebuild</Code> script is a
              one-line fix I have not made.
            </Regret>

            <Regret n={2} title="The palette exists in two places, and one of them is not the stylesheet">
              <Code>src/app/layout.tsx</Code> sets{" "}
              <Code>viewport.themeColor</Code> with two literal hex values — the
              light and dark page backgrounds, copied out of the token block. It
              is the only colour on the site that does not come from a custom
              property, which makes it the only colour the contrast checker
              cannot see, which makes it precisely the drift that script was
              written to prevent. I noticed while writing this paragraph. That is
              an argument for writing colophons.
            </Regret>

            <Regret n={3} title="The dark theme is written out twice">
              Every dark token appears in both a{" "}
              <Code>prefers-color-scheme</Code> block and a{" "}
              <Code>[data-theme=&quot;dark&quot;]</Code> block, because an explicit
              choice has to beat the OS in both directions. The duplication is
              deliberate and I still pay for it: the parity assertion in the
              contrast checker exists solely to catch the two copies diverging.
              A test that guards a duplication I chose is a workaround wearing a
              lab coat. CSS <Code>light-dark()</Code> would collapse them, at the
              price of a user&rsquo;s explicit choice no longer being able to
              override their system setting — which is the wrong trade, so this
              one may just stay.
            </Regret>

            <Regret n={4} title="The corpus is validated twice, by two code paths">
              The content loader parses and validates when a page renders;{" "}
              <Code>check:content</Code> parses and validates again, separately,
              in its own script. Same files, same schema, two implementations of
              the reading. They agree today. The first time they disagree, the
              gate will be the one that is wrong, and it will be wrong in the
              reassuring direction.
            </Regret>

            <Regret n={5} title="MDX compiles inside the render, not the build">
              <Code>next-mdx-remote</Code> compiles each document during the React
              render rather than in a compile-time content pipeline. It keeps the
              corpus out of the module graph, which is genuinely nice, but it
              means an MDX syntax error surfaces as a render error rather than at
              parse time, and the compile cost is paid per rendered page instead
              of once. At {projectCount} documents this is invisible. It is the
              wrong shape at ten times that.
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
   Local primitives. Same visual language as the project pages — mono section
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
