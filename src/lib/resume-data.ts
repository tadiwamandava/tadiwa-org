import { SITE } from "@/lib/site";
import type { RoleFamily } from "@/lib/content/schema";

/* ============================================================================
   Résumé content that is NOT in the project corpus.

   The projects on the résumé come from `content/projects/*.mdx` — that is the
   whole point of /resume, and it is why the bullets there can never drift from
   the writeups. But a résumé also needs education, employment, and coursework,
   and none of that is a project. This file is the small typed island for that
   material.

   ---------------------------------------------------------------------------
   THE RULE FOR THIS FILE

   Every string here is either something I can point at, or it is a visible
   placeholder. There is no third category. A résumé is the one document where a
   plausible-looking invented number is worse than an obvious blank: the blank
   costs ten minutes, the invented number costs the offer.

   Placeholders are written as `CONFIRM: …` (a fact that exists, I just do not
   have it in front of me) or `TODO(tadiwa): …` (something that has to be
   written). Both are detected by `needsConfirmation()` below, rendered in the
   accent colour on screen, printed in bold, and counted in a banner at the top
   of the page. They are deliberately ugly. They are supposed to be.

   The placeholder STRINGS are kept terse, because several of them render in a
   narrow date column and a paragraph of instructions there would wreck the
   layout it is trying to protect. The instructions live in the comments beside
   each field instead — which is where you will be when you fill them in.
   ========================================================================= */

/** Matches the two placeholder conventions used across this repo — the same
 *  markers `content/projects/*.mdx` and `src/lib/site.ts` already use, so the
 *  résumé inherits every unconfirmed fact from the corpus for free. */
const PLACEHOLDER_RE = /CONFIRM|TODO\(tadiwa\)/;

export function needsConfirmation(value: string): boolean {
  return PLACEHOLDER_RE.test(value);
}

/* ---------------------------------------------------------------------------
   Identity block
   ------------------------------------------------------------------------ */

export interface ContactItem {
  label: string;
  /** What is printed. Keep it short — this line has to survive a 6pt render. */
  value: string;
  href?: string;
}

/** Strips the scheme and any trailing slash so a link prints as `tadiwa.org`
 *  rather than `https://tadiwa.org/`. Résumés are read on paper. */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export const RESUME_IDENTITY = {
  name: SITE.name,

  /** Sits directly under the name on both variants. Neutral on purpose: the
   *  variant-specific positioning line is separate, below this one. */
  subtitle: "Computer Engineering · University of Oklahoma",

  // Which city goes on the résumé is a decision, not a lookup: Norman is where
  // the campus is, but a hiring team reading "Norman, OK" makes relocation
  // assumptions. Pick one deliberately.
  location: "CONFIRM: city, state",

  contact: [
    {
      label: "Email",
      // SITE.email is intentionally blank in src/lib/site.ts — the decision
      // about an alias vs. a personal address has not been made. Until it is,
      // the résumé says so out loud rather than quietly omitting the line.
      value: SITE.email || "CONFIRM: résumé email",
      href: SITE.email ? `mailto:${SITE.email}` : undefined,
    },
    {
      // A phone number on a public web page gets scraped. Consider printing it
      // only in the PDF you attach to applications, and deleting this entry.
      label: "Phone",
      value: "TODO(tadiwa): phone, or delete",
    },
    {
      label: "GitHub",
      value: displayUrl(SITE.github),
      href: SITE.github,
    },
    {
      label: "LinkedIn",
      value: displayUrl(SITE.linkedin),
      href: SITE.linkedin,
    },
    {
      label: "Site",
      value: displayUrl(SITE.url),
      href: SITE.url,
    },
  ] satisfies ContactItem[],
} as const;

/* ---------------------------------------------------------------------------
   Education
   ------------------------------------------------------------------------ */

export interface EducationEntry {
  school: string;
  location: string;
  degree: string;
  /** e.g. "Aug 2024 – May 2028". Split so the two halves can be confirmed
   *  independently — the start date is knowable, the end date is a forecast. */
  start: string;
  end: string;
  /** Omit the line entirely rather than printing a number you are not sure of. */
  gpa: string;
  honors: string[];
}

export const EDUCATION: EducationEntry[] = [
  {
    school: "University of Oklahoma",
    location: "Norman, OK",
    degree: "B.S. Computer Engineering",
    // Term you first enrolled, e.g. "Aug 2024".
    start: "CONFIRM: start term",
    // Expected graduation. A junior aiming at Summer 2027 internships is
    // usually a May 2028 graduate, but "usually" is not a fact about you, and
    // recruiters filter on this field. Get it exactly right.
    end: "CONFIRM: grad term",
    // Set this to an empty string to drop the line entirely. Listing no GPA is
    // a normal choice; listing one you have not checked this semester is not.
    gpa: "CONFIRM: GPA",
    honors: [
      "TODO(tadiwa): scholarships, honors college, Dean's List — or delete this list",
    ],
  },
];

/* Coursework is variant-specific: the same transcript reads differently to a
   firmware team than to a backend team. Both lists are placeholders because I
   will not guess at OU course titles or numbers on a document that goes to a
   registrar-checkable employer. */
export const COURSEWORK: Record<ResumeVariantId, string> = {
  software:
    "TODO(tadiwa): completed + in-progress courses that matter to a software screener, by their real OU titles — data structures, algorithms, operating systems, computer architecture, discrete math. List only what is on the transcript.",
  hardware:
    "TODO(tadiwa): completed + in-progress courses that matter to a hardware screener, by their real OU titles — digital design, signals, circuits, embedded systems, VLSI. List only what is on the transcript.",
};

/* ---------------------------------------------------------------------------
   Experience

   One entry today. The shape is built for more.
   ------------------------------------------------------------------------ */

export interface ExperienceEntry {
  org: string;
  title: string;
  location: string;
  start: string;
  end: string;
  /** Which variants show this entry. Employment almost always shows on both —
   *  a screener who sees a gap asks about the gap. */
  variants: ResumeVariantId[];
  /** Same formula the corpus uses for `resumeBullets`:
   *  strong verb + what + how + measured outcome. */
  bullets: string[];
}

export const EXPERIENCE: ExperienceEntry[] = [
  {
    // "University of Oklahoma IT" vs. the specific department that signs your
    // timesheet — use whatever a background check would return.
    org: "CONFIRM: employer name",
    // The official title in the OU system, not the one you'd rather have.
    title: "CONFIRM: job title",
    location: "Norman, OK",
    start: "CONFIRM: start date",
    end: "CONFIRM: end date", // or "Present"
    variants: ["software", "hardware"],
    bullets: [
      "TODO(tadiwa): the ticket/support bullet, with a real number — how many machines, tickets, or users, over what period. Verb + what + how + measured outcome.",
      "TODO(tadiwa): the automation bullet. Anything you scripted, imaged, or standardised, and the time it took off the queue. This is the bullet that reads as engineering rather than labour.",
      "TODO(tadiwa): the ownership bullet — a system, process, or piece of documentation you were the person responsible for. Delete this line if there isn't one; two strong bullets beat three padded ones.",
    ],
  },
];

/* ---------------------------------------------------------------------------
   Skills

   Most of this section is derived from the corpus at render time — see
   `deriveSkillGroups()` in src/app/resume/select.ts. Nothing appears under
   Languages or Tools unless a project on this site actually uses it.

   These curated groups exist for the things a repository cannot prove:
   instruments, benches, and EDA tools. They are placeholders for the same
   reason everything else here is.
   ------------------------------------------------------------------------ */

export interface CuratedSkillGroup {
  label: string;
  variants: ResumeVariantId[];
  items: string[];
}

export const CURATED_SKILL_GROUPS: CuratedSkillGroup[] = [
  {
    label: "Hardware & lab",
    variants: ["hardware"],
    items: [
      // Name the models, not the categories: "Saleae Logic 8, DS1054Z, ST-Link
      // v2, Nucleo-F411RE" is checkable; "test equipment" is not.
      "TODO(tadiwa): instruments and boards you have driven",
      // Vivado / Quartus / Questa / Verilator / KiCad — only the ones you could
      // open right now and get a waveform out of.
      "TODO(tadiwa): EDA and simulation tools you have run",
    ],
  },
  {
    label: "Practices",
    variants: ["software", "hardware"],
    items: [
      // Version control, review, CI, testing discipline. Five or six words
      // total — screeners skim this row, they do not read it.
      "TODO(tadiwa): working practices, five words",
    ],
  },
];

/* ---------------------------------------------------------------------------
   The two variants
   ------------------------------------------------------------------------ */

export type ResumeVariantId = "software" | "hardware";

export interface ResumeVariant {
  id: ResumeVariantId;
  /** Toggle label. */
  label: string;
  /** The positioning line under the name on the document itself. */
  headline: string;
  /** Screen-only explanation of what this variant is optimised for. */
  rationale: string;
  /**
   * Role families this variant is aimed at, strongest first.
   *
   * Ordering is load-bearing: `select.ts` weights a project's `roleRelevance`
   * score by position in this array, so the first family listed is the one that
   * decides ties. These are role families and not company names on purpose —
   * companies reorganise, "does this person debug across the ISA boundary"
   * does not. Nvidia alone maps to four of the ten.
   */
  families: RoleFamily[];
}

export const RESUME_VARIANTS: Record<ResumeVariantId, ResumeVariant> = {
  software: {
    id: "software",
    label: "Software-forward",
    headline: "Systems and infrastructure software",
    rationale:
      "Leads with the work that survives a code-reading interview: storage, services, migrations, and the measurements that back them.",
    families: [
      "systems",
      "backend-infra",
      "ml-infra",
      "generalist-swe",
      "gpu",
      "product",
    ],
  },
  hardware: {
    id: "hardware",
    label: "Hardware-forward",
    headline: "Firmware, RTL, and silicon bring-up",
    rationale:
      "Leads with the work below the operating system: bare-metal firmware, RTL, verification environments, and post-silicon debug.",
    families: [
      "firmware",
      "rtl-fpga",
      "design-verification",
      "silicon-validation",
      "systems",
      "gpu",
    ],
  },
};

export const DEFAULT_VARIANT: ResumeVariantId = "software";

/** Narrows an untrusted `?variant=` value. Anything unrecognised falls back to
 *  the default rather than 404ing — a mistyped query param on a link you sent a
 *  recruiter should still render a résumé. */
export function parseVariant(raw: string | string[] | undefined): ResumeVariantId {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "hardware" || value === "software" ? value : DEFAULT_VARIANT;
}

/** Human-readable names for the role families, for the screen-only chips that
 *  show *why* a project ranked where it did. */
export const ROLE_FAMILY_LABELS: Record<RoleFamily, string> = {
  systems: "systems",
  "ml-infra": "ML infra",
  gpu: "GPU",
  "backend-infra": "backend infra",
  firmware: "firmware",
  "design-verification": "DV",
  "rtl-fpga": "RTL/FPGA",
  "silicon-validation": "si validation",
  "generalist-swe": "generalist SWE",
  product: "product",
};
