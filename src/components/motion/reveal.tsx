"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Scroll entrance for the parts of a section.
 *
 * Motion rather than CSS, and that is the dividing line Emil Kowalski draws:
 * CSS for predetermined animation because it runs off the main thread, JS for
 * what is dynamic and interruptible. A scroll entrance depends on where the
 * viewport is, which CSS cannot know without an observer anyway, so the JS is
 * already being paid for.
 *
 * `once` because this is an entrance, not an effect. Replaying it every time a
 * section re-enters the viewport turns a page into a slideshow.
 *
 * `useReducedMotion` is not decoration here. The project's reduced-motion
 * block collapses CSS durations to 0.01ms, and Motion does not read that
 * block, so without this hook a visitor who asked for less motion would get
 * all of it.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const still = useReducedMotion();

  if (still) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, transform: "translateY(10px)" }}
      whileInView={{ opacity: 1, transform: "translateY(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{
        duration: 0.5,
        delay,
        // The strong ease-out from the same source. The built-in curves are
        // too weak to read as intentional.
        ease: [0.23, 1, 0.32, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
