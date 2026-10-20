/**
 * Single source of truth for identity strings.
 *
 * Anything marked CONFIRM is a value I could not verify. Set it before the
 * first deploy. They are deliberately obvious rather than plausible-looking,
 * so a wrong one fails loudly instead of shipping quietly.
 */
export const SITE = {
  name: "Tadiwa Mandava",
  /** Sits under the name in the header and in every OG card. */
  role: "Computer Engineering @ OU",

  /** The 30-second pitch. This is the single most-read sentence on the site. */
  description:
    "Tadiwa Mandava, computer engineering at the University of Oklahoma. Projects in RISC-V verification, embedded kernels, storage, and language-model inference.",

  url: "https://tadiwa.org",

  github: "https://github.com/tadiwamandava",
  linkedin: "https://www.linkedin.com/in/tadiwanashe-mandava",
  /** The .edu address, which is the one already printed on the r\u00e9sum\u00e9 that
   *  goes out to employers. Publishing it here exposes nothing that document
   *  does not, and it keeps one address to check rather than two. */
  email: "tadiwamandava@ou.edu",

  /** Drives the header's "currently building" strip. */
  nowBuilding: "the retrieval and inference stack behind this site's lab",
} as const;

export const NAV = [
  { href: "/projects", label: "Projects" },
  { href: "/lab", label: "Lab" },
  { href: "/resume", label: "Résumé" },
] as const;
