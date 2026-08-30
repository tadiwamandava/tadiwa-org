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
    "Computer engineering junior at the University of Oklahoma, building across the hardware/software boundary: storage engines, RTOS kernels, RISC-V silicon, and the inference stack that runs on this page.",

  url: "https://tadiwa.org",

  // --- CONFIRM before deploy ------------------------------------------------
  github: "https://github.com/tadiwamandava",
  linkedin: "https://www.linkedin.com/in/CONFIRM-linkedin-slug",
  /** Publishing an address invites scrapers. Consider an alias, not your
   *  personal Gmail. Left blank on purpose; decide, then fill. */
  email: "",
  // --------------------------------------------------------------------------

  /** Drives the header's "currently building" strip. */
  nowBuilding: "an LSM storage engine in Rust, and a bare-metal RTOS on STM32",
} as const;

export const NAV = [
  { href: "/projects", label: "Projects" },
  { href: "/lab", label: "Lab" },
  { href: "/writing", label: "Writing" },
  { href: "/resume", label: "Résumé" },
] as const;
