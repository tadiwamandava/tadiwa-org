import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/site-header";
import { PaletteMount } from "@/components/search/palette-mount";
import { SITE } from "@/lib/site";
import "./globals.css";

const display = localFont({
  src: "./fonts/audiowide-latin.woff2",
  variable: "--font-display-face",
  weight: "400",
  display: "swap",
});

const body = localFont({
  src: "./fonts/onest-latin.woff2",
  variable: "--font-body-face",
  weight: "100 900",
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
  themeColor: "#050505",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      /* Next 16 stopped overriding scroll-behavior during navigation. Without
         this attribute the `scroll-behavior: smooth` in globals.css makes every
         route change slow-scroll to the top instead of jumping. */
      data-scroll-behavior="smooth"
      className={`h-full antialiased ${display.variable} ${body.variable}`}
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
