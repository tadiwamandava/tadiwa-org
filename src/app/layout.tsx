import type { Metadata, Viewport } from "next";
import { Source_Serif_4 } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { PaletteMount } from "@/components/search/palette-mount";
import { SITE } from "@/lib/site";
import "./globals.css";

/* One web font, for display only.

   Source Serif 4, not Saira. Saira was chosen to approximate Industry, the
   commercial face on a site this layout was referenced from, which made the
   headline voice a substitute for somebody else's decision. A squarish
   grotesque on near-black with a single bright accent is also the exact
   costume every generated portfolio wears.

   A serif is the opposite choice and the honest one here: this site argues
   through writing, and a text face designed for reading says that before a
   word is read. Source Serif is a workhorse rather than a fashion, which is
   the point, and it is open-licensed.

   Body and mono stay on the system stack, so the two faces a reader spends
   the most time in cost zero bytes.

   The VARIABLE cut, not static weights: one file covers the whole axis and
   is smaller than the static cuts it replaces. Latin only, and next/font
   computes fallback metrics at build so nothing reflows when it swaps in. */
const display = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-display-face",
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
  themeColor: "#1a1310",
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
        <PaletteMount />
      </body>
    </html>
  );
}
