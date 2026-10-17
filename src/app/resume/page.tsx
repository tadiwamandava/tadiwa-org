import type { Metadata } from "next";
import Link from "next/link";
import { getAllProjects } from "@/lib/content";
import { SITE } from "@/lib/site";
import {
  COURSEWORK,
  CURATED_SKILL_GROUPS,
  EDUCATION,
  EXPERIENCE,
  RESUME_IDENTITY,
  RESUME_VARIANTS,
  ROLE_FAMILY_LABELS,
  needsConfirmation,
  parseVariant,
  type ResumeVariantId,
} from "@/lib/resume-data";
import {
  collectPlaceholders,
  deriveSkillGroups,
  isResumeEligible,
  selectProjects,
  type Placeholder,
  type SelectedProject,
} from "./select";
import { PrintButton } from "./print-button";
import styles from "./resume.module.css";

/* ============================================================================
   /resume

   The résumé is generated from the same corpus as the rest of the site, which
   is what stops it drifting from the work it describes. Every project bullet on
   this page is a string out of `content/projects/*.mdx`. If a number changes
   there it changes here, and if it is wrong here it is wrong on the writeup
   too, where an interviewer can see it.

   Two variants, one document. `roleRelevance` in each project's frontmatter
   scores it 0–3 against ten role families; the variant picks which families it
   cares about and in what order, and `select.ts` does the rest. Nothing is
   rewritten per variant. The ordering and the depth change, the sentences do
   not.

   ---------------------------------------------------------------------------
   ON RENDERING: this is the one route on the site that is not prerendered.
   Reading `searchParams` opts a page into request-time rendering, which is the
   price of `?variant=` being a real, shareable, no-JavaScript URL. The
   alternative, a `[[...variant]]` segment generating two static pages, buys
   back the prerender but has to 404 on `/resume/anything-else` and makes the
   canonical URL uglier. For a page served a few hundred times a year, the
   simpler route shape won.

   ON PDF EXPORT: Cmd-P plus the print stylesheet in resume.module.css produces
   the document today. Whether there is ALSO a generated `/resume.pdf`, headless
   Chromium in CI, committed as a static asset, so an emailed link never depends
   on the reader owning a print dialog, is deferred. It is a build-pipeline
   decision, not a design one, and the print stylesheet is a prerequisite for
   either path.
   ========================================================================= */

export async function generateMetadata(
  props: PageProps<"/resume">,
): Promise<Metadata> {
  const variant = RESUME_VARIANTS[parseVariant((await props.searchParams).variant)];
  return {
    title: `Résumé: ${variant.label.toLowerCase()}`,
    description: `${SITE.name} resume, ${variant.label.toLowerCase()}.`,
  };
}

export default async function ResumePage(props: PageProps<"/resume">) {
  const variantId = parseVariant((await props.searchParams).variant);
  const variant = RESUME_VARIANTS[variantId];

  const projects = getAllProjects();
  const selected = selectProjects(projects, variant);
  const notYetBuilt = projects.filter((p) => !isResumeEligible(p));
  const derivedSkills = deriveSkillGroups(projects);
  const curatedSkills = CURATED_SKILL_GROUPS.filter((g) =>
    g.variants.includes(variantId),
  );
  const experience = EXPERIENCE.filter((e) => e.variants.includes(variantId));

  /* Every unconfirmed fact reachable from this render, collected in one pass so
     the banner can enumerate them. Only plain data goes in, because a `Project` would
     drag its entire MDX body along with it. */
  const placeholders: Placeholder[] = [
    ...collectPlaceholders(RESUME_IDENTITY, "identity"),
    ...collectPlaceholders(EDUCATION, "education"),
    ...collectPlaceholders(COURSEWORK[variantId], "education.coursework"),
    ...collectPlaceholders(experience, "experience"),
    ...collectPlaceholders(curatedSkills, "skills"),
    ...selected.flatMap((s) =>
      collectPlaceholders(s.bullets, `projects.${s.project.slug}.resumeBullets`),
    ),
  ];

  return (
    <div className={styles.page}>
      {/* ---- the explanation (screen only) ------------------------------- */}
      <header
        className={`${styles.noPrint} border-b border-border bg-surface`}
      >
        <div className="mx-auto max-w-(--container-wide) px-5 py-14 sm:px-8">
          <div className="max-w-3xl">
          <h1 className="mt-5 font-display text-4xl leading-tight tracking-tight">
            Résumé
          </h1>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <VariantToggle current={variantId} />
            <PrintButton />
          </div>

            {placeholders.length > 0 && <ConfirmBanner items={placeholders} />}
          </div>
        </div>
      </header>

      {/* ---- the document ------------------------------------------------ */}
      <div className={styles.sheetWrap}>
        <article className={styles.sheet}>
          <header className="border-b border-border pb-5">
            <h1 className="font-display text-3xl leading-none tracking-tight">
              {RESUME_IDENTITY.name}
            </h1>
            <p className={`${styles.meta} mt-0.5 text-sm text-subtle`}>
              {RESUME_IDENTITY.subtitle}
            </p>

            <ul
              className={`${styles.meta} mt-4 flex flex-wrap items-baseline font-mono text-2xs text-muted`}
            >
              <ContactItems />
            </ul>
          </header>

          {/* ---- education ---- */}
          <SheetSection label="Education">
            {EDUCATION.map((entry) => (
              <div key={entry.school} className={`${styles.entry} space-y-1`}>
                <EntryHead
                  title={entry.school}
                  meta={
                    entry.start ? (
                      <>
                        <Fact value={entry.start} /> <span aria-hidden>→</span>{" "}
                        <Fact value={entry.end} />
                      </>
                    ) : (
                      // The printed résumé shows the expected graduation alone.
                      // An empty start must not leave a dangling arrow behind.
                      <Fact value={entry.end} />
                    )
                  }
                />
                <p className="text-sm text-muted">
                  {entry.degree}
                  <Dot />
                  {entry.location}
                  {entry.gpa && (
                    <>
                      <Dot />
                      GPA <Fact value={entry.gpa} />
                    </>
                  )}
                </p>
                {entry.honors.length > 0 && (
                  <p className="text-sm text-muted">
                    {entry.honors.map((h, i) => (
                      <span key={h}>
                        {i > 0 && <Dot />}
                        <Fact value={h} />
                      </span>
                    ))}
                  </p>
                )}
                {COURSEWORK[variantId] && (
                  <p className="text-sm text-muted">
                    <Label>Coursework</Label>{" "}
                    <Fact value={COURSEWORK[variantId]} />
                  </p>
                )}
              </div>
            ))}
          </SheetSection>

          {/* ---- experience ---- */}
          {experience.length > 0 && (
            <SheetSection label="Experience">
              <div className="space-y-6">
                {experience.map((entry) => (
                  <div key={entry.org} className={styles.entry}>
                    <EntryHead
                      title={<Fact value={entry.title} />}
                      meta={
                        <>
                          <Fact value={entry.start} />{" "}
                          <span aria-hidden>→</span>{" "}
                          <Fact value={entry.end} />
                        </>
                      }
                    />
                    <p className="mt-0.5 text-sm text-muted">
                      <Fact value={entry.org} />
                      <Dot />
                      {entry.location}
                    </p>
                    <Bullets items={entry.bullets} />
                  </div>
                ))}
              </div>
            </SheetSection>
          )}

          {/* ---- projects, selected from the corpus ---- */}
          <SheetSection label="Projects">
            {selected.length === 0 ? (
              <EmptyProjects variantId={variantId} />
            ) : (
              <div className="space-y-6">
                {selected.map((entry) => (
                  <ProjectEntry key={entry.project.slug} entry={entry} />
                ))}
              </div>
            )}

            {notYetBuilt.length > 0 && (
              <p
                className={`${styles.noPrint} mt-5 border-l-2 border-border pl-3 text-xs leading-relaxed text-subtle`}
              >
                {notYetBuilt.length} more{" "}
                {notYetBuilt.length === 1 ? "project is" : "projects are"} in the
                corpus with <code className="font-mono">status: planned</code>{" "}
                and{" "}
                {notYetBuilt.length === 1 ? "was" : "were"} excluded before
                scoring. The <Link href="/projects" className="text-accent underline decoration-border underline-offset-2">projects page</Link>{" "}
                lists them because a dated commitment is worth something on a
                portfolio. A résumé is a claim about work that exists, so they
                do not appear here until they ship.
              </p>
            )}
          </SheetSection>

          {/* ---- skills ---- */}
          <SheetSection label="Skills">
            <dl className="space-y-2">
              {derivedSkills.map((group) => (
                <SkillRow key={group.label} label={group.label}>
                  {group.items.map((item, i) => (
                    <span
                      key={item.name}
                      title={`Used by ${item.count} project${item.count === 1 ? "" : "s"} on this site`}
                    >
                      {i > 0 && <Dot />}
                      {item.name}
                    </span>
                  ))}
                </SkillRow>
              ))}
              {curatedSkills.map((group) => (
                <SkillRow key={group.label} label={group.label}>
                  {group.items.map((item, i) => (
                    <span key={item}>
                      {i > 0 && <Dot />}
                      <Fact value={item} />
                    </span>
                  ))}
                </SkillRow>
              ))}
            </dl>
          </SheetSection>
        </article>

      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Variant toggle

   Two real links, not a button pair. Each variant is a distinct URL you can
   send to a recruiter, it works with JavaScript off, back/forward do the
   obvious thing, and `aria-current` tells a screen reader which one is showing
   , which colour and weight alone cannot.
   ------------------------------------------------------------------------ */
function VariantToggle({ current }: { current: ResumeVariantId }) {
  return (
    <div
      role="group"
      aria-label="Résumé variant"
      className="inline-flex rounded border border-border-strong p-0.5"
    >
      {Object.values(RESUME_VARIANTS).map((v) => {
        const active = v.id === current;
        return (
          <Link
            key={v.id}
            href={`/resume?variant=${v.id}`}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-sm bg-accent px-3 py-1.5 text-sm font-medium text-accent-contrast"
                : "rounded-sm px-3 py-1.5 text-sm text-muted transition-colors hover:text-text"
            }
          >
            {v.label}
          </Link>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The unconfirmed-facts banner.

   Screen only, but the markers themselves print, so a résumé sent out with a
   blank still announces the blank on paper. This list exists so the fix is a
   checklist rather than a hunt.
   ------------------------------------------------------------------------ */
function ConfirmBanner({ items }: { items: Placeholder[] }) {
  return (
    <aside className="mt-8 rounded border-l-2 border-accent bg-accent-subtle px-4 py-3.5">
      <p className="text-2xs tracking-[0.12em] text-accent uppercase">
        {items.length} unconfirmed {items.length === 1 ? "field" : "fields"}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed">
        Marked in the document below and on the printed page. Nothing here was
        guessed at. Dates, GPA, employer names and metrics are blanks until a
        real value replaces them, because a plausible wrong number on a résumé
        costs more than an obvious missing one.
      </p>
      <details className="mt-2.5">
        <summary className="cursor-pointer text-sm text-accent">
          Show every field
        </summary>
        <ul className="mt-2.5 space-y-1">
          {items.map((item) => (
            <li key={`${item.where}-${item.text}`} className="text-xs leading-relaxed">
              <code className="font-mono text-2xs text-muted">{item.where}</code>
              <span className="mx-1.5 text-subtle" aria-hidden>
                ·,
              </span>
              <span className="text-muted">{item.text}</span>
            </li>
          ))}
        </ul>
      </details>
    </aside>
  );
}

/* ---------------------------------------------------------------------------
   Document primitives
   ------------------------------------------------------------------------ */

function SheetSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`${styles.section} mt-7`}>
      <h2 className="mb-3 border-b border-border pb-1.5 text-2xs tracking-[0.14em] text-muted uppercase">
        {label}
      </h2>
      {children}
    </section>
  );
}

/** Title on the left, dates on the right, sharing a baseline. The date column
 *  never wraps under the title. That is the layout tell that separates a
 *  résumé from a list of paragraphs. */
function EntryHead({
  title,
  meta,
}: {
  title: React.ReactNode;
  meta: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <h3 className="font-display text-lg leading-snug">{title}</h3>
      {meta ? (
        <span className={`${styles.meta} shrink-0 font-mono text-2xs text-subtle`}>
          {meta}
        </span>
      ) : null}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((item) => (
        <li key={item} className="relative pl-4 text-sm leading-relaxed text-muted">
          <span className={styles.tick} aria-hidden />
          <Fact value={item} />
        </li>
      ))}
    </ul>
  );
}

function ProjectEntry({ entry }: { entry: SelectedProject }) {
  const { project } = entry;
  return (
    <div className={styles.entry}>
      <EntryHead
        title={
          // A link on screen, plain text on paper. The URL is already in the
          // contact line, so printing it again per project is noise.
          <Link
            href={`/projects/${project.slug}`}
            className="underline decoration-border underline-offset-4 transition-colors hover:text-accent"
          >
            {project.title}
          </Link>
        }
        meta={null}
      />

      <p className={`${styles.meta} mt-0.5 font-mono text-2xs text-subtle`}>
        {/* "In progress" is on the printed page, not just the screen. It is the
            difference between a true sentence and a false one, and it is
            cheaper to say it here than to be asked about it in the room. */}
        {project.status === "building" && (
          <span className="text-accent">In progress · </span>
        )}
        {project.languages.join(" · ")}
        {project.stack.length > 0 && ` · ${project.stack.join(" · ")}`}
      </p>

      {entry.missingBullets ? (
        <p className="mt-2 text-sm leading-relaxed">
          <Fact
            value={`TODO(tadiwa): no resumeBullets in content/projects/${project.slug}.mdx. This project qualifies for the ${entry.tier} slot but has nothing to say for itself`}
          />
        </p>
      ) : (
        <Bullets items={entry.bullets} />
      )}

    </div>
  );
}

function EmptyProjects({ variantId }: { variantId: ResumeVariantId }) {
  const variant = RESUME_VARIANTS[variantId];
  return (
    <p className="rounded border border-dashed border-border-strong p-5 text-sm leading-relaxed text-muted">
      No shipped or in-progress project in the corpus scores above zero on{" "}
      {variant.families.map((f) => ROLE_FAMILY_LABELS[f]).join(", ")}. That is an
      accurate statement about the work, not a bug in the page. The fix is to
      finish a project, or to correct a{" "}
      <code className="font-mono">roleRelevance</code> block in{" "}
      <code className="font-mono">content/projects/*.mdx</code>. An empty
      section is recoverable; a {variant.label.toLowerCase()} résumé padded with
      work that does not match is not.
    </p>
  );
}

function SkillRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-x-4 gap-y-0.5 sm:flex-row">
      <dt className="w-40 shrink-0 pt-0.5 text-2xs tracking-[0.1em] text-subtle uppercase">
        {label}
      </dt>
      <dd className="text-sm leading-relaxed text-muted">{children}</dd>
    </div>
  );
}

function ContactItems() {
  const items: Array<{ key: string; node: React.ReactNode }> = [
    { key: "location", node: <Fact value={RESUME_IDENTITY.location} /> },
    ...RESUME_IDENTITY.contact.map((c) => ({
      key: c.label,
      node: c.href ? (
        <a
          href={c.href}
          className="underline decoration-border underline-offset-2 transition-colors hover:text-accent"
          {...(c.href.startsWith("http")
            ? { target: "_blank", rel: "noreferrer" }
            : {})}
        >
          <Fact value={c.value} />
        </a>
      ) : (
        <Fact value={c.value} />
      ),
    })),
  ];

  return (
    <>
      {items.map((item, i) => (
        <li key={item.key}>
          {item.node}
          {/* Trailing separator, not leading: this row wraps to two or three
              lines at narrow widths, and a leading dot would start a line with
              punctuation. */}
          {i < items.length - 1 && (
            <span className="mx-2 text-border-strong" aria-hidden>
              ·
            </span>
          )}
        </li>
      ))}
    </>
  );
}

/** Renders a fact, or renders it loudly if it is still a placeholder. */
function Fact({ value }: { value: string }) {
  return needsConfirmation(value) ? (
    <span className={styles.confirm}>{value}</span>
  ) : (
    <>{value}</>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-2xs tracking-[0.1em] text-subtle uppercase">
      {children}
    </span>
  );
}

function Dot() {
  return (
    <span className="mx-1.5 text-border-strong" aria-hidden>
      ·
    </span>
  );
}
