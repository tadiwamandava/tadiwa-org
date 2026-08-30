"use client";

/* ============================================================================
   bench-canvas.tsx, lifecycle only.

   This is the module `next/dynamic({ ssr: false })` splits on, so it is also
   the wall the renderer is not allowed to climb over: it touches `window`,
   `document` and a 2D context, none of which exist on the server.

   It renders one <canvas>. Everything it does happens in effects, and all of it
   is undone on unmount, a route change must leave behind no loop, no observer,
   no listener and no backing store.
   ========================================================================= */

import { useEffect, useRef, type RefObject } from "react";

import type { BoardLayout } from "./board-layout";
import { BenchRenderer } from "./bench-renderer";
import { paletteEquals, readPalette, watchTheme } from "./palette";
import type { ProbeTarget } from "./types";

import styles from "./bench.module.css";

/** Above 2× the pixel count quadruples for no visible gain on a vector board. */
function pixelRatio(): number {
  return Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}

export default function BenchCanvas({
  layout,
  probeRef,
  active,
  reducedMotion,
  onPainted,
}: {
  layout: BoardLayout;
  /** Written by the shell on every pointer move; read by the renderer per frame. */
  probeRef: RefObject<ProbeTarget>;
  active: number | null;
  reducedMotion: boolean;
  /** Must be referentially stable; it is a dependency of the boot effect. */
  onPainted: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<BenchRenderer | null>(null);
  /* Mount-time snapshot. The [layout] effect below re-syncs immediately after
     boot, so a stale value here survives at most one frame, and that beats
     rebuilding the renderer on every resize tick. */
  const bootLayout = useRef(layout);
  const bootMotion = useRef(reducedMotion);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let palette = readPalette(canvas);
    let renderer: BenchRenderer;
    try {
      renderer = new BenchRenderer(
        canvas,
        probeRef,
        bootLayout.current,
        palette,
        pixelRatio(),
      );
    } catch {
      // No 2D context (a locked-down browser, or a canvas budget exhausted).
      // The list underneath is already the whole feature; say nothing and stop.
      return;
    }
    rendererRef.current = renderer;
    renderer.setReducedMotion(bootMotion.current);
    renderer.whenPainted(onPainted);

    /* The theme is a live input, not a boot-time constant: `data-theme` can
       flip under us, and the "system" setting changes with no attribute change
       at all. Re-read the tokens and re-etch rather than caching a colour. */
    const stopTheme = watchTheme(() => {
      const next = readPalette(canvas);
      if (paletteEquals(next, palette)) return;
      palette = next;
      renderer.setPalette(next);
    });

    return () => {
      stopTheme();
      rendererRef.current = null;
      renderer.destroy();
    };
  }, [probeRef, onPainted]);

  // Resize reuses the renderer rather than rebuilding it: rebuilding on a
  // window drag would allocate a pair of backing stores per frame.
  useEffect(() => {
    rendererRef.current?.setLayout(layout, pixelRatio());
  }, [layout]);

  useEffect(() => {
    rendererRef.current?.setActive(active);
  }, [active]);

  useEffect(() => {
    rendererRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  return <canvas ref={canvasRef} className={styles.board} aria-hidden="true" />;
}
