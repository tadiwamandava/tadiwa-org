import { z } from "zod";

/* ============================================================================
   The corpus schema.

   Four consumers depend on this file, which is why it is strict:
     1. /projects/[slug]  — renders every field
     2. the HNSW search   — chunks the prose fields into the vector index
     3. /tailor           — the ONLY facts the model is allowed to assert
     4. /resume           — selects and orders `resumeBullets`

   Consumer 3 is why several fields other portfolios treat as optional are
   required here. A model asked to "write about this project" will invent
   numbers; a model asked to "pick from these pre-written bullets" cannot.
   ========================================================================= */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Role families from Ch.1 (software) and Ch.10 (hardware).
 *  Deliberately NOT company names — companies reorganise, role families don't,
 *  and a company maps to several of these. See lib/content/roles.ts. */
export const ROLE_FAMILIES = [
  "systems",
  "ml-infra",
  "gpu",
  "backend-infra",
  "firmware",
  "design-verification",
  "rtl-fpga",
  "silicon-validation",
  "generalist-swe",
  "product",
] as const;
export type RoleFamily = (typeof ROLE_FAMILIES)[number];

export const DOMAINS = [
  "systems",
  "ml-infra",
  "gpu",
  "embedded",
  "silicon",
  "web",
  "dsp",
  "ops",
] as const;

/** shipped  — done, documented, defensible in an interview
 *  building — actively in progress, honest about it
 *  planned  — scheduled, not started; renders as a dated commitment */
export const STATUSES = ["shipped", "building", "planned"] as const;

/* ---------------------------------------------------------------------------
   Benchmarks. §2.3: "benchmarks are the new screenshots."
   hardware / methodology / gapAnalysis are REQUIRED. A number without the
   conditions that produced it is a claim, not evidence — and an interviewer
   will ask for exactly these three things.
   ------------------------------------------------------------------------ */
export const benchmarkRunSchema = z.object({
  label: z.string().min(1),
  value: z.number(),
  /** ± spread across repetitions, same unit as `value`. */
  variance: z.number().nonnegative().optional(),
  /** Marks a baseline you are measured AGAINST (Redis, ripgrep, cuBLAS). */
  isReference: z.boolean().default(false),
  note: z.string().optional(),
});

export const benchmarkSetSchema = z.object({
  title: z.string().min(1),
  unit: z.string().min(1),
  higherIsBetter: z.boolean(),
  hardware: z.string().min(10, "Name the actual machine — CPU, RAM, disk"),
  methodology: z
    .string()
    .min(30, "State reps, warmup, and what was held constant"),
  measuredOn: isoDate,
  runs: z.array(benchmarkRunSchema).min(2, "A single bar is not a comparison"),
  /** The honest paragraph. §2.3: honest gap analysis reads as competence;
   *  suspicious victory claims read as fabrication. */
  gapAnalysis: z
    .string()
    .min(40, "Explain why the reference implementation is still faster"),
});

/* ---------------------------------------------------------------------------
   Design decisions — §2.2 item 5, "the section AI-generated repos never have."
   `rejected` is required because a decision without a discarded alternative is
   not a decision, it is a default.
   ------------------------------------------------------------------------ */
export const decisionSchema = z.object({
  made: z.string().min(1),
  rejected: z.string().min(1, "What did you NOT do? Name it."),
  why: z.string().min(20),
  /** Set true when hindsight changed your mind. Interviewers reward this. */
  regret: z.boolean().default(false),
});

export const artifactSchema = z.object({
  kind: z.enum(["repo", "demo", "writeup", "video", "capture", "package", "paper"]),
  label: z.string().min(1),
  href: z.string().min(1),
  /** Logic-analyzer captures, waveforms, flamegraphs — the hardware exhibits. */
  caption: z.string().optional(),
});

/** A card-face number. "Numbers, not adjectives." */
export const metricSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  title: z.string().optional(),
});

export const projectFrontmatterSchema = z.object({
  title: z.string().min(1),
  /** ONE sentence: what it is + the hardest thing about it. Written first,
   *  because writing it first is what forces the scope to stay honest. */
  pitch: z.string().min(20).max(200),
  status: z.enum(STATUSES),
  started: isoDate,
  finished: isoDate.optional(),
  domains: z.array(z.enum(DOMAINS)).min(1),
  languages: z.array(z.string()).min(1),
  stack: z.array(z.string()).default([]),

  /** 2–3 sentences framing the difficulty. §2.2 item 3. */
  hardestThing: z.string().min(40),
  decisions: z.array(decisionSchema).default([]),
  benchmarks: z.array(benchmarkSetSchema).default([]),
  wouldDoDifferently: z.array(z.string()).default([]),
  artifacts: z.array(artifactSchema).default([]),
  metrics: z.array(metricSchema).max(4).default([]),

  /** Pre-written, honest, quantified. §20.2's formula:
   *  strong verb + what + how + measured outcome.
   *  /tailor SELECTS from these; it never writes new ones. */
  resumeBullets: z.array(z.string()).default([]),

  /** 0 = irrelevant, 3 = lead with this. Drives /tailor ordering. */
  roleRelevance: z.partialRecord(z.enum(ROLE_FAMILIES), z.number().int().min(0).max(3)).default({}),

  featured: z.boolean().default(false),
  pinOrder: z.number().int().optional(),
  /** Client-owned or NDA'd work that cannot be open-sourced. Rendered as an
   *  explicit note rather than a dead repo link. */
  sourceAvailable: z.boolean().default(true),
  sourceNote: z.string().optional(),
});

export const postFrontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(20).max(300),
  published: isoDate,
  updated: isoDate.optional(),
  /** Links a post to the project it documents, for cross-navigation. */
  project: z.string().optional(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
});

export type ProjectFrontmatter = z.infer<typeof projectFrontmatterSchema>;
export type PostFrontmatter = z.infer<typeof postFrontmatterSchema>;
export type BenchmarkSet = z.infer<typeof benchmarkSetSchema>;
export type BenchmarkRun = z.infer<typeof benchmarkRunSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type Metric = z.infer<typeof metricSchema>;

export interface Project extends ProjectFrontmatter {
  slug: string;
  body: string;
  readingTimeMinutes: number;
}

export interface Post extends PostFrontmatter {
  slug: string;
  body: string;
  readingTimeMinutes: number;
}
