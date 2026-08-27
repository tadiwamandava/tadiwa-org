import type { Metadata, Viewport } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ThemeScript } from "@/components/theme-script";
import { PaletteMount } from "@/components/search/palette-mount";
import { SITE } from "@/lib/site";
import "./globals.css";

/* No web fonts.
   Helvetica Neue is a system face on macOS/iOS with no worthwhile web-font
   equivalent, so the type stack is declared in globals.css and nothing is
   downloaded. Zero font requests, zero swap-induced layout shift, and ~90KB
   off the critical path. Non-Apple platforms fall through to Arial /
   Liberation Sans, which are metrically close enough that layout holds. */

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.role}`,
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
    title: `${SITE.name} — ${SITE.role}`,
    description: SITE.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.role}`,
    description: SITE.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      /* Next 16 stopped overriding scroll-behavior during navigation. Without
         this attribute the `scroll-behavior: smooth` in globals.css makes every
         route change slow-scroll to the top instead of jumping. */
      data-scroll-behavior="smooth"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-bg text-text">
        <ThemeScript />
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
