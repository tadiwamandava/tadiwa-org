import type { Metadata, Viewport } from "next";
import { Saira } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PaletteMount } from "@/components/search/palette-mount";
import { SITE } from "@/lib/site";
import "./globals.css";

/* One web font, for display only.
   Saira is a squarish grotesque, and it is here because the reference layout
   this page follows sets its headings in Industry (Fort Foundry). Industry is
   a commercial licence and its files cannot be copied off another site, so
   this is the closest open equivalent: same semi-condensed squarish
   proportions and flat terminals, under the SIL Open Font License.
   If the licence is ever bought, this is the one line that changes.

   Body and mono stay on the system stack. That is not a compromise, it is what
   the reference does too, and it keeps the two faces a reader spends the most
   time in at zero bytes.

   The VARIABLE cut, not static weights. Asking for 600 and 700 shipped two
   files and covered neither the 400 that some display elements resolve to, so
   those rendered in the fallback while their neighbours rendered in Saira.
   One variable file covers the whole axis and is smaller than the static cuts
   it replaces. Latin only, and next/font computes fallback metrics at build
   so nothing reflows when it swaps in. */
const display = Saira({
  subsets: ["latin"],
  variable: "--font-saira",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} · ${SITE.role}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  authors: [{ name: SITE.name, url: SITE.url }],
  creator: SITE.name,
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE.url,
    siteName: SITE.name,
    title: `${SITE.name} · ${SITE.role}`,
    description: SITE.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} · ${SITE.role}`,
    description: SITE.description,
  },
  robots: { index: true, follow: true },
};

/* One theme, so one colour. This is the last literal hex on the site that the
   contrast checker cannot see, because it is metadata rather than CSS; it must
   stay equal to --bg in globals.css. */
export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#09090b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      /* Next 16 stopped overriding scroll-behavior during navigation. Without
         this attribute the `scroll-behavior: smooth` in globals.css makes every
         route change slow-scroll to the top instead of jumping. */
      data-scroll-behavior="smooth"
      className={`h-full antialiased ${display.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-bg text-text">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1} className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <PaletteMount />
      </body>
    </html>
  );
}
