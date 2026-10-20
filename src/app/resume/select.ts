import type { Project, RoleFamily } from "@/lib/content/schema";
import { needsConfirmation, type ResumeVariant } from "@/lib/resume-data";

/* ============================================================================
   Corpus → résumé.

   This is the whole architectural claim of /resume in about a hundred lines:
   the projects section is *selected*, never authored. Every sentence that
   reaches the page came out of `content/projects/*.mdx`, so a bullet cannot say
   something the writeup does not.

   Three things are being decided here:
     1. WHICH projects are ELIGIBLE at all, from `status`
     2. Which of those appear, and in what order, from `roleRelevance`
     3. HOW MANY bullets each one gets, from the tier, then a budget

   None of them invents text. If a project has no `resumeBullets`, this file
   surfaces that as a content bug rather than papering over it with the pitch.
   ========================================================================= */

/**
 * Status gate. The first and most important filter.
 *
 * A résumé is a claim about work that exists. `planned` projects are scheduled,
 * not started; the site lists them because a dated, visible trajectory is worth
 * something on a portfolio, but on a résumé the same entry is a lie with a
 * future tense. They are excluded here regardless of how well they score, and
 * the page says how many were dropped rather than hiding the filter.
 *
 * `building` survives, and is labelled as in progress on the document itself.
 * "Currently building X" is a true sentence; "Built X" would not be.
 */
const RESUME_ELIGIBLE: ReadonlySet<Project["status"]> = new Set([
  "shipped",
  "building",
]);

export function isResumeEligible(project: Project): boolean {
  return RESUME_ELIGIBLE.has(project.status);
}

export type Tier = "lead" | "support" | "mention";

export interface ScoredReason {
  family: RoleFamily;
  relevance: number;
}

export interface SelectedProject {
  project: Project;
  tier: Tier;
  score: number;
  /** Families that earned it a place, strongest first. Rendered on screen (not
   *  in print) so the ranking is auditable instead of magic. */
  reasons: ScoredReason[];
  bullets: string[];
  /** True when the project qualified but the corpus has no bullets for it. */
  missingBullets: boolean;
}

/** How many bullets each tier is allowed before the page budget applies. */
const TIER_BULLETS: Record<Tier, number> = {
  lead: 3,
  support: 2,
  mention: 1,
};

/**
 * Total project bullets on the page.
 *
 * One page is the constraint that makes this section hard. Education and
 * employment take roughly a third of a US Letter sheet at 9.6pt, which leaves
 * room for about eight project bullets plus a skills block. When the corpus
 * outgrows that, this number is the knob rather than the font size.
 */
const PAGE_BULLET_BUDGET = 2;

/**
 * Weighted relevance for one project under one variant.
 *
 * `variant.families` is ordered by importance, so a family's weight is its
 * distance from the end of that list. A project scoring 3 on the variant's
 * first family beats one scoring 3 on its fifth, which is the behaviour you
 * want when two projects are otherwise equally strong.
 */
function scoreFor(project: Project, variant: ResumeVariant): number {
  return variant.families.reduce((total, family, index) => {
    const relevance = project.roleRelevance[family] ?? 0;
    const weight = variant.families.length - index;
    return total + relevance * weight;
  }, 0);
}

/**
 * Tier from the project's single strongest signal, not its total.
 *
 * A project that scores 3 on exactly one relevant family is a lead project for
 * that family, being narrow is not a demerit. Summing instead would rank a
 * project that is a 1 across six families above a genuine specialist, which is
 * exactly backwards for an internship screen.
 */
function tierFor(project: Project, variant: ResumeVariant): Tier | null {
  const peak = Math.max(
    0,
    ...variant.families.map((f) => project.roleRelevance[f] ?? 0),
  );
  if (peak >= 3) return "lead";
  if (peak === 2) return "support";
  if (peak === 1) return "mention";
  return null; // scored 0 everywhere this variant cares about; it does not belong
}

function reasonsFor(project: Project, variant: ResumeVariant): ScoredReason[] {
  return variant.families
    .map((family) => ({ family, relevance: project.roleRelevance[family] ?? 0 }))
    .filter((r) => r.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance);
}

export function selectProjects(
  projects: Project[],
  variant: ResumeVariant,
): SelectedProject[] {
  const qualified = projects
    .filter(isResumeEligible)
    .map((project) => {
      const tier = tierFor(project, variant);
      return tier === null
        ? null
        : {
            project,
            tier,
            score: scoreFor(project, variant),
            reasons: reasonsFor(project, variant),
          };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    // Highest weighted score first. `getAllProjects()` already sorts in-flight
    // work above finished work and newest first, and Array.prototype.sort is
    // stable, so that ordering survives as the tie-break.
    .sort((a, b) => b.score - a.score);

  let remaining = PAGE_BULLET_BUDGET;

  return qualified.map((entry) => {
    const cap = Math.min(TIER_BULLETS[entry.tier], Math.max(remaining, 0));
    const bullets = entry.project.resumeBullets.slice(0, cap);
    remaining -= bullets.length;
    return {
      ...entry,
      bullets,
      // A qualifying project with nothing to say about itself is a hole in the
      // corpus, and the page says so. Silently falling back to `pitch` would
      // hide the hole and put marketing copy on a résumé.
      missingBullets: entry.project.resumeBullets.length === 0,
    };
  })
    // A project the budget could not reach is dropped, not printed as a bare
    // heading. The budget used to cap bullets while still returning every
    // qualifying project, so the lowest-ranked one reached the sheet as a
    // title and a tech line with nothing underneath. Measured: "Bare-Metal
    // RTOS on STM32" rendered at 38px with zero bullets.
    //
    // The corpus-hole case above is deliberately kept: that one has no bullets
    // because none were written, and the page is supposed to say so.
    .filter((entry) => entry.bullets.length > 0 || entry.missingBullets);
}

/* ---------------------------------------------------------------------------
   Skills, also derived
   ------------------------------------------------------------------------ */

export interface DerivedSkill {
  name: string;
  /** How many projects in the corpus use it. Drives the ordering, and is the
   *  reason this list can be defended line by line in an interview. */
  count: number;
}

export interface DerivedSkillGroup {
  label: string;
  items: DerivedSkill[];
}

function tally(values: string[][]): DerivedSkill[] {
  const counts = new Map<string, number>();
  for (const list of values) {
    // A project that lists the same language twice should still count once.
    for (const name of new Set(list)) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Skills, taken from the corpus rather than from memory.
 *
 * The constraint is the point: nothing reaches this section unless a project on
 * this site uses it. That makes the list shorter than a conventional skills
 * block and every entry answerable with "here, this one, line 40". Keyword-
 * stuffing a skills row is the cheapest thing on a résumé and the fastest thing
 * to unravel in a phone screen.
 *
 * Derived from the whole corpus rather than the variant's selection, because a hardware team
 * asking "do you know SQL" wants the true answer, not the on-message one. But
 * the status gate applies here too, and it bites hardest in this section: a
 * `planned` CUDA project would otherwise put CUDA in the skills row of someone
 * who has not written a kernel yet. That is precisely the move this section
 * exists to refuse.
 */
export function deriveSkillGroups(projects: Project[]): DerivedSkillGroup[] {
  const shipped = projects.filter(isResumeEligible);
  return [
    { label: "Languages", items: tally(shipped.map((p) => p.languages)) },
    { label: "Frameworks & tools", items: tally(shipped.map((p) => p.stack)) },
  ].filter((group) => group.items.length > 0);
}

/* ---------------------------------------------------------------------------
   Unconfirmed facts
   ------------------------------------------------------------------------ */

export interface Placeholder {
  /** Dotted path to the field, so it can be found and fixed without hunting. */
  where: string;
  text: string;
}

/**
 * Walks a plain-data tree and collects every string still carrying a
 * `CONFIRM:` / `TODO(tadiwa):` marker.
 *
 * Feed it plain data only, never a `Project`, whose `body` is the entire MDX
 * document and would drown the list. The résumé passes it the specific fields
 * it renders.
 */
export function collectPlaceholders(root: unknown, label: string): Placeholder[] {
  const found: Placeholder[] = [];

  const walk = (node: unknown, path: string): void => {
    if (typeof node === "string") {
      if (needsConfirmation(node)) found.push({ where: path, text: node });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${path}[${i}]`));
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        walk(value, `${path}.${key}`);
      }
    }
  };

  walk(root, label);
  return found;
}
