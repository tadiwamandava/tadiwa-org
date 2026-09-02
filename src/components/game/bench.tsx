"use client";

/* ============================================================================
   bench.tsx, the shell.

   Everything the visitor actually uses lives here as plain DOM: one <ul>, one
   <a> per project, real text, real focus. The canvas is a sibling layer that is:

     · lazily fetched (it touches `window`, so it cannot be server-rendered);
     · only ever mounted when the layout solver says this width can hold a
       legible board; and
     · allowed to fail. If the chunk never arrives or the solver refuses the
       space, `live` stays false, the list keeps its ordinary card layout, and
       nothing is lost but decoration.

   The rule the whole file is organised around: the links are never the canvas's
   responsibility. Hover and focus feed the canvas; the canvas never feeds back.

   ONE BOX, agreed in advance. The stage's height is reserved by the stylesheet
   from `--bench-rows`, and both presentations live inside it: the fallback grid
   fills it with that many rows of cards, the board fits its floorplan into it.
   Nothing resizes the stage when the canvas goes live, so the page does not
   move.

   Both numbers come from the project count via the same cost function, which is
   what keeps them honest. The revision before this one fixed the stage at
   `clamp(360px, 42vw, 540px)`, a guess that knew neither number, and between
   640px and ~730px it clipped five of the eleven projects behind an inner
   scrollbar. The revision after that derived the height from the board and
   wrote it back, which cost 180px of layout shift the moment the canvas
   painted.
   ========================================================================= */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  balancedCols,
  benchRows,
  computeBoardLayout,
  type ChipLayout,
} from "./board-layout";
import {
  designator,
  type BenchProject,
  type ProbeTarget,
} from "./types";

import styles from "./bench.module.css";

const BenchCanvas = dynamic(() => import("./bench-canvas"), { ssr: false });

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function Bench({ projects }: { projects: BenchProject[] }) {
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [painted, setPainted] = useState(false);
  const [hot, setHot] = useState<number | null>(null);

  const reducedMotion = useMediaQuery(REDUCED_MOTION);

  /* The probe target is the one piece of state the canvas needs at pointer
     frequency, so it travels by ref: written here in an event handler, read by
     the renderer in its own loop, and never a reason to render. */
  const probeRef = useRef<ProbeTarget>({ x: 0, y: 0, visible: false });

  /* `null` whenever this width cannot hold a legible board, which is stricter
     than any media query, because it knows the project count. Eleven modules
     need ~700px; three need ~560px. */
  const layout = useMemo(
    () => (box === null ? null : computeBoardLayout(box.w, box.h, projects.length)),
    [box, projects.length],
  );

  /* Links only move onto the footprints once a frame has actually been etched,
     so a slow chunk or a refused boot degrades to something finished rather
     than to an empty box. */
  const live = layout !== null && painted;
  /* Derived, not stored: when the board goes away mid-session the highlight has
     to go with it, and deriving beats an effect that clears state. */
  const active = live ? hot : null;

  /* ---- measurement ----------------------------------------------------
     Safe to read both axes: the stage's height is a pure function of the
     project count and the viewport, written by the stylesheet. Nothing in this
     component ever writes it back, so there is no feedback loop. */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      setBox((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onPainted = useCallback(() => setPainted(true), []);

  /* ---- engagement -----------------------------------------------------
     One entry point for hover and focus, because they mean the same thing to
     the board. `via` only decides whether the probe jumps to the chip (there is
     no pointer to follow when tabbing, and none to follow under reduced motion
     either) or keeps tracking the pointer. */
  const engage = useCallback(
    (index: number | null, via: "pointer" | "key") => {
      const jump = via === "key" || reducedMotion;
      const chip = index === null ? undefined : layout?.chips[index];

      if (jump && chip) {
        /* Pin 1, not the package centre. A crosshair parked in the middle of a
           footprint sits directly on top of the label the visitor is trying to
           read; parked on the keyed corner it reads as a probe touching a pin,
           which is both truer to the metaphor and out of the way of the text. */
        probeRef.current.x = chip.x - 2;
        probeRef.current.y = chip.y + chip.h - 7;
        probeRef.current.visible = true;
      } else if (jump && index === null) {
        probeRef.current.visible = false;
      }

      setHot(index);
    },
    [layout, reducedMotion],
  );

  const trackPointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!live || reducedMotion) return;
      const rect = event.currentTarget.getBoundingClientRect();
      probeRef.current.x = event.clientX - rect.left;
      probeRef.current.y = event.clientY - rect.top;
      probeRef.current.visible = true;
    },
    [live, reducedMotion],
  );

  const releasePointer = useCallback(() => {
    probeRef.current.visible = false;
    setHot(null);
  }, []);

  const current = active === null ? null : projects[active];

  /* Three sets of numbers, all derived from the project count on the server,
     so they are in the first HTML the browser sees, not applied a second later:

       --bench-cols-*  the fallback grid's column count at three widths. CSS
                       `auto-fill` cannot do this, at 1152px it fits five
                       215px tracks, and eleven cards then render 5/5/1, with
                       U11 orphaned beside four empty cells.

       --bench-rows-*  how many rows that column count implies, and therefore
                       how much stage the stylesheet reserves. This is the
                       number the fallback and the board have to agree on.

       --chip-*        the type scale a footprint can actually hold, from the
                       solver rather than from a media query that cannot see the
                       chip. Without it a 124px package rendered "DSP: Filter". */
  const vars = {
    "--bench-cols-sm": balancedCols(projects.length, 2),
    "--bench-cols-md": balancedCols(projects.length, 3),
    "--bench-cols-lg": balancedCols(projects.length, 4),
    "--bench-rows-sm": benchRows(projects.length, 2),
    "--bench-rows-md": benchRows(projects.length, 3),
    "--bench-rows-lg": benchRows(projects.length, 4),
    ...(live && layout
      ? {
          "--chip-font": `${layout.labelFont}px`,
          "--chip-lines": layout.labelLines,
        }
      : null),
  } as CSSProperties;

  return (
    <>
      <div
        ref={stageRef}
        className={styles.stage}
        style={vars}
        data-live={live ? "true" : undefined}
        onPointerMove={trackPointer}
        onPointerLeave={releasePointer}
      >
        {layout ? (
          <BenchCanvas
            layout={layout}
            probeRef={probeRef}
            active={active}
            reducedMotion={reducedMotion}
            onPainted={onPainted}
          />
        ) : null}

        <span className={`${styles.silk} ${styles.silkStart}`} aria-hidden="true">
          Bench-01 · Rev C
        </span>
        <span className={`${styles.silk} ${styles.silkEnd}`} aria-hidden="true">
          {projects.length} {projects.length === 1 ? "module" : "modules"}
        </span>

        <ul className={styles.index}>
          {projects.map((project, index) => {
            const href = `/projects/${project.slug}`;
            return (
              <li
                key={project.slug}
                className={styles.item}
                data-active={active === index ? "true" : undefined}
                style={live && layout ? chipStyle(layout.chips[index]) : undefined}
              >
                <Link
                  href={href}
                  className={styles.chip}
                  onPointerEnter={() => engage(index, "pointer")}
                  onPointerLeave={() => engage(null, "pointer")}
                  onFocus={() => engage(index, "key")}
                  onBlur={() => engage(null, "key")}
                  onKeyDown={(event) => {
                    // Enter is native on an anchor; Space is not, and the brief
                    // asks for both. Unhandled, Space scrolls the page instead.
                    if (event.key !== " " && event.key !== "Spacebar") return;
                    event.preventDefault();
                    router.push(href);
                  }}
                >
                  <span className={styles.designator}>{designator(index)}</span>
                  <span className={styles.title}>{project.title}</span>
                  <span className={styles.pitch}>{project.pitch}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Decoration. Every word below is already in the accessible name of the
          link that produced it, so announcing it again would double-read on
          every Tab press. */}
      <div className={styles.readout} aria-hidden="true">
        {current && active !== null ? (
          <>
            <p className={styles.readoutHead}>
              <span className={styles.readoutDes}>{designator(active)}</span>
              <span className={styles.readoutTitle}>{current.title}</span>
              {current.metric ? (
                <span className={styles.readoutStatus}>
                  {current.metric.value} {current.metric.label}
                </span>
              ) : null}
            </p>
            <p className={styles.readoutPitch}>{current.pitch}</p>
          </>
        ) : live ? (
          <p className={styles.readoutIdle}>
            Probe a module, point at one, or press{" "}
            <span className={styles.readoutKey}>Tab</span> to walk the board.
          </p>
        ) : (
          <p className={styles.readoutIdle}>
            Every project on this site is a part on one board.
          </p>
        )}
      </div>
    </>
  );
}

function chipStyle(chip: ChipLayout | undefined): CSSProperties | undefined {
  if (!chip) return undefined;
  return { left: chip.x, top: chip.y, width: chip.w, height: chip.h };
}

/* ---------------------------------------------------------------------------
   Browser state, read through useSyncExternalStore rather than an effect.

   matchMedia is an external store in the precise sense React means: a value the
   component does not own, plus a subscription for changes. Mirroring it into
   state from useEffect renders once with the wrong answer first, which is what
   the lint rule against setState-in-effect exists to stop.
   ------------------------------------------------------------------------ */

const mediaCache = new Map<string, MediaQueryList>();

function media(query: string): MediaQueryList {
  let mql = mediaCache.get(query);
  if (!mql) {
    mql = window.matchMedia(query);
    mediaCache.set(query, mql);
  }
  return mql;
}

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = media(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => media(query).matches,
    // The server knows neither the viewport nor the motion preference. `false`
    // is the neutral answer to both, and matches the markup that ships.
    () => false,
  );
}
