"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { tearClip } from "./tear";

/**
 * A draggable seam between two renderings of the same page.
 *
 * The technique is the comparison slider from Emil Kowalski's skill: stack the
 * two layers, clip the top one and move the clip with the pointer. No extra
 * DOM per frame, and clip-path is composited, so dragging stays on the GPU.
 *
 * The edge is a tear rather than a cut. `inset()` can only give a straight
 * line, so the clip is a `polygon()` whose right side is a correlated random
 * walk, generated once in ./tear and translated by the drag. See that file
 * for why the shape is fixed and why the walk is correlated.
 *
 * The seam percentage is written straight to the element's style rather than
 * through React state or a CSS custom property on a parent. Both of the
 * alternatives are measurably worse: state re-renders the whole subtree on
 * every pointermove, and a parent custom property invalidates style for every
 * child that inherits it, which here is the entire document view.
 *
 * Pointer capture so a fast drag that leaves the element keeps dragging, and
 * a multi-touch guard so a second finger cannot teleport the seam.
 */
export function Seam({
  documentHalf,
  designedHalf,
}: {
  documentHalf: React.ReactNode;
  designedHalf: React.ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const clipped = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [pct, setPct] = useState(42);

  const place = useCallback((next: number) => {
    const v = Math.min(92, Math.max(8, next));
    if (clipped.current) {
      clipped.current.style.clipPath = tearClip(v);
    }
    if (handle.current) {
      handle.current.style.left = `${v}%`;
    }
    return v;
  }, []);

  const fromEvent = useCallback(
    (clientX: number) => {
      const box = wrap.current?.getBoundingClientRect();
      if (!box) return;
      place(((clientX - box.left) / box.width) * 100);
    },
    [place],
  );

  useEffect(() => {
    place(pct);
    // Only to set the initial clip; the drag path never goes through state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDown = (e: React.PointerEvent) => {
    if (dragging.current) return; // ignore a second finger mid-drag
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    fromEvent(e.clientX);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    fromEvent(e.clientX);
  };

  const onUp = (e: React.PointerEvent) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const box = wrap.current?.getBoundingClientRect();
    if (box) setPct(Math.round(((e.clientX - box.left) / box.width) * 100));
  };

  // Keyboard: the seam is a slider, so it answers to arrows like one.
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft") setPct((v) => place(v - step));
    else if (e.key === "ArrowRight") setPct((v) => place(v + step));
    else if (e.key === "Home") setPct(place(8));
    else if (e.key === "End") setPct(place(92));
    else return;
    e.preventDefault();
  };

  return (
    <div ref={wrap} className="seam-wrap" onPointerMove={onMove}>
      <div className="seam-layer">{designedHalf}</div>
      <div ref={clipped} className="seam-layer seam-clipped">
        {documentHalf}
      </div>

      <div
        ref={handle}
        className="seam-handle"
        role="slider"
        tabIndex={0}
        aria-label="Drag to compare the raw document with the designed page"
        aria-valuemin={8}
        aria-valuemax={92}
        aria-valuenow={pct}
        aria-valuetext={`${pct}% document, ${100 - pct}% designed`}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onKeyDown={onKey}
      >
        <span className="seam-grip" aria-hidden="true" />
      </div>
    </div>
  );
}
