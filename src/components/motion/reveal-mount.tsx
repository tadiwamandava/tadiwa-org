"use client";

import dynamic from "next/dynamic";

/**
 * Keeps Motion out of the first-paint bundle.
 *
 * The budget gate allows 150 KiB gzip of critical JS and the framework runtime
 * alone is about 140, leaving ~10. Motion is several times that, so it loads
 * as its own chunk after paint. `ssr: false` because the server has no
 * viewport to observe against.
 *
 * The children are server-rendered and passed in as a prop, so the markup is
 * in the HTML a crawler or an ATS parser receives whether or not the chunk
 * ever loads. Verified rather than assumed: the card pitch appears in the SSR
 * response with JavaScript never executing.
 */
const Reveal = dynamic(() => import("./reveal").then((m) => m.Reveal), {
  ssr: false,
  loading: () => null,
});

export function RevealMount({
  children,
  delay,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <Reveal delay={delay} className={className}>
      {children}
    </Reveal>
  );
}
