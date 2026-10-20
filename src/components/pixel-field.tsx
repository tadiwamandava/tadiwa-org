"use client";

import { useEffect, useRef } from "react";
import styles from "./pixel-field.module.css";

/**
 * `bar` fills its container and does not fade; `hero` keeps the 128px band and
 * the downward mask. Same cells, same colours, same loop, so the header reads
 * as the top of one field rather than a different material.
 *
 * Per-cell brightness is independent noise, so two instances need no shared
 * seed to look continuous. What would break continuity is one of them being
 * static while the other moves, which is why the header runs the real canvas
 * instead of a CSS grid.
 */
export function PixelField({ variant = "hero" }: { variant?: "hero" | "bar" }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    const hero = host?.parentElement;
    const context = canvas?.getContext("2d");
    if (!canvas || !host || !hero || !context) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let width = 0, height = 0, columns = 0;
    let base = new Float32Array(0), energy = new Float32Array(0);
    let x = -1000, y = -1000, inside = false, visible = true;
    let frame = 0, previous = 0, time = 0;

    function paint(now: number) {
      frame = 0;
      if (!visible || document.hidden) return;
      const animated = !motion.matches;
      if (animated && previous && now - previous < 1000 / 30) {
        frame = requestAnimationFrame(paint);
        return;
      }
      const elapsed = previous ? Math.min((now - previous) / 1000, 0.1) : 1 / 60;
      previous = now;
      if (animated) time += elapsed;
      const interactive = animated && inside && pointer.matches;
      const decay = Math.exp(-elapsed * 5);
      let settling = false;
      context!.clearRect(0, 0, width, height);
      context!.fillStyle = "rgb(198, 204, 212)";
      for (let i = 0; i < base.length; i++) {
        const px = (i % columns) * 4, py = Math.floor(i / columns) * 4;
        const distance = ((px - x) ** 2 + (py - y) ** 2) / (110 * 110);
        const target = interactive ? Math.max(0, 1 - distance) ** 2 : 0;
        const previousEnergy = energy[i];
        energy[i] = target > previousEnergy ? target : previousEnergy * decay;
        if (Math.abs(energy[i] - target) > 0.004) settling = true;
        const phase = base[i] * 270;
        const shimmer = (Math.sin(time * (0.5 + base[i] * 5) + phase) + 1) / 2;
        const drift = (Math.sin(px * 0.012 + py * 0.018 - time * 0.45) + 1) / 2;
        const ambient = animated ? base[i] * 0.45 + shimmer * 0.12 + drift * 0.045 : base[i];
        context!.globalAlpha = Math.min(0.32, ambient + energy[i] * 0.24);
        context!.fillRect(px, py, 2, 2);
      }
      context!.globalAlpha = 1;
      host!.dataset.ready = "true";
      if (animated || settling) frame = requestAnimationFrame(paint);
    }

    function schedule() {
      if (visible && !document.hidden && !frame) frame = requestAnimationFrame(paint);
    }

    function resize() {
      const rect = host!.getBoundingClientRect();
      width = rect.width; height = rect.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.max(1, Math.round(width * ratio));
      canvas!.height = Math.max(1, Math.round(height * ratio));
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      columns = Math.ceil(width / 4);
      const count = columns * Math.ceil(height / 4);
      base = new Float32Array(count);
      energy = new Float32Array(count);
      let seed = 9173;
      for (let i = 0; i < count; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        base[i] = 0.035 + (seed / 4294967295) * 0.15;
      }
      schedule();
    }

    function move(event: PointerEvent) {
      if (event.pointerType !== "mouse" || motion.matches || !pointer.matches) return;
      const rect = host!.getBoundingClientRect();
      x = event.clientX - rect.left;
      y = event.clientY - rect.top;
      inside = y >= -110 && y <= height + 110;
      schedule();
    }

    function leave() { inside = false; schedule(); }
    function preferences() {
      inside = false;
      energy.fill(0);
      schedule();
    }
    function pageVisibility() {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      inside = false;
      energy.fill(0);
      schedule();
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) { previous = 0; schedule(); }
      else { cancelAnimationFrame(frame); frame = 0; inside = false; energy.fill(0); }
    });
    visibilityObserver.observe(host);
    hero.addEventListener("pointermove", move, { passive: true });
    hero.addEventListener("pointerleave", leave);
    motion.addEventListener("change", preferences);
    pointer.addEventListener("change", preferences);
    document.addEventListener("visibilitychange", pageVisibility);
    resize();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      hero.removeEventListener("pointermove", move);
      hero.removeEventListener("pointerleave", leave);
      motion.removeEventListener("change", preferences);
      pointer.removeEventListener("change", preferences);
      document.removeEventListener("visibilitychange", pageVisibility);
      delete host.dataset.ready;
    };
  }, []);

  return (
    <div
      className={`${styles.field} ${variant === "bar" ? styles.bar : ""}`}
      aria-hidden="true"
    >
      <canvas ref={ref} />
    </div>
  );
}
