import { SITE } from "@/lib/site";
import type { RoleFamily } from "@/lib/content/schema";

/* ============================================================================
   Résumé content that is NOT in the project corpus.

   The projects on the résumé come from `content/projects/*.mdx`. That is the
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
   each field instead, which is where you will be when you fill them in.
   ========================================================================= */

/** Matches the two placeholder conventions used across this repo, the same
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
  /** What is printed. Keep it short; this line has to survive a 6pt render. */
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

  location: "Norman, OK",

  contact: [
    {
      label: "Email",
      value: SITE.email,
      href: `mailto:${SITE.email}`,
    },
    // No phone. The PDF that goes to employers carries one; a public web page
    // gets scraped, and this page and that document do not have to match on a
    // field whose only purpose is for someone to call you.
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
  /** Both optional in practice: the printed résumé shows only the expected
   *  graduation, which is the field recruiters actually filter on, so `start`
   *  is an empty string and the range collapses to one date. */
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
    degree: "B.S. Computer Engineering, Minor in Mathematics",
    // Empty on purpose, and not a placeholder: the résumé prints "Expected
    // May 2028" alone, so this page does too rather than inventing a term.
    start: "",
    end: "Expected May 2028",
    // Blank drops the line. The printed résumé lists no GPA, and a site that
    // volunteers one the document omits is two different claims about you.
    gpa: "",
    honors: [],
  },
];

/* Coursework is variant-specific in shape, and empty in fact.

   The printed résumé carries no coursework section, and that is the right call
   once there are five independent projects to spend the space on: a course
   title says you sat in a room, a verification environment says you built one.
   Empty strings drop the section rather than printing a placeholder. Fill them
   only from a transcript, never from memory, since this is the one section an
   employer can check against a registrar. */
export const COURSEWORK: Record<ResumeVariantId, string> = {
  software: "",
  hardware: "",
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
  /** Which variants show this entry. Employment almost always shows on both,
   *  a screener who sees a gap asks about the gap. */
  variants: ResumeVariantId[];
  /** Same formula the corpus uses for `resumeBullets`:
   *  strong verb + what + how + measured outcome. */
  bullets: string[];
}

export const EXPERIENCE: ExperienceEntry[] = [
  {
    org: "K20 Center, University of Oklahoma",
    title: "Software Engineering Intern",
    location: "Norman, OK",
    start: "January 2026",
    end: "Present",
    variants: ["software", "hardware"],
    bullets: [
      "Develop and deploy front-end and back-end web applications and Unity/C# educational games used by K\u201312 teachers and students; test across Center projects, reproducing and filing defects",
      "Built and shipped Hive, a classroom platform for curating and publishing boards of links, images, and video; owned the stack from PostgreSQL schema through REST API to deployed React SPA",
    ],
  },
  {
    org: "University of Oklahoma IT",
    title: "IT Service Delivery Specialist",
    location: "Norman, OK",
    start: "September 2024",
    end: "Present",
    // Shown on both variants deliberately. It is not engineering work and it
    // does not pretend to be, but it is two continuous years of it, and a
    // screener who finds a gap asks about the gap.
    variants: ["software", "hardware"],
    bullets: [
      "Administer identity and access management and Microsoft 365 services across 30,000+ user accounts, automating account provisioning and recurring administrative workflows with PowerShell",
      "Operate on a five-person cross-functional team handling ticket-driven telecom, account, and backend operations requests, sustaining a 98.4% satisfaction rate",
    ],
  },
];

/* ---------------------------------------------------------------------------
   Skills

   Most of this section is derived from the corpus at render time; see
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
      // Named parts, not categories: a screener can check "Basys 3" and cannot
      // check "test equipment".
      "Basys 3 FPGA, STM32F446 (ARM Cortex-M4), logic analyzer",
      "Vivado, Verilator, OpenOCD, GDB, ARM GCC, Nsight Compute",
      "RTL design, constrained-random verification, RISC-V RV32I",
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
  /**
   * Role families this variant is aimed at, strongest first.
   *
   * Ordering is load-bearing: `select.ts` weights a project's `roleRelevance`
   * score by position in this array, so the first family listed is the one that
   * decides ties. These are role families and not company names on purpose,
   * companies reorganise, "does this person debug across the ISA boundary"
   * does not. Nvidia alone maps to four of the ten.
   */
  families: RoleFamily[];
}

export const RESUME_VARIANTS: Record<ResumeVariantId, ResumeVariant> = {
  software: {
    id: "software",
    label: "Software-forward",
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
 *  the default rather than 404ing, a mistyped query param on a link you sent a
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
