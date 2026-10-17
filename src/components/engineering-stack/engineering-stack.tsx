"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./engineering-stack.module.css";

const layers = [
  {
    name: "Silicon", number: "01", title: "RISC-V core and verification",
    description: "A pipelined RV32I core checked against a reference simulator. The diagram shows the instruction stages from fetch to writeback.",
    href: "/projects/riscv-cpu-verification", link: "Read the RISC-V writeup",
    detail: "FETCH → DECODE → EXECUTE → MEMORY → WRITEBACK",
  },
  {
    name: "Systems", number: "02", title: "Scheduling and storage",
    description: "A real-time kernel schedules the work. A crash-safe storage engine keeps the data. Two projects at the hardware/software boundary.",
    href: "/projects/rtos-stm32", link: "Read the RTOS writeup",
    detail: "SCHEDULE → EXECUTE → WRITE → PERSIST",
  },
  {
    name: "Intelligence", number: "03", title: "Language-model inference",
    description: "A language-model forward pass, written in C++. Follow the path from input tokens through attention to the next prediction.",
    href: "/projects/llm-inference-engine", link: "Read the inference writeup",
    detail: "EMBED → ATTEND → PROJECT → NEXT TOKEN",
  },
] as const;

/** Illustrative architecture, not live telemetry or a claim that these projects share a runtime. */
function BoardDrawing({ layer }: { layer: number }) {
  return (
    <svg viewBox="0 0 280 280" fill="none" aria-hidden="true">
      <g className={styles.traces} stroke="currentColor" strokeWidth="1">
        {[0, 90, 180, 270].map((angle) => (
          <g key={angle} transform={`rotate(${angle} 140 140)`}>
            <path d="M105 85V52L87 34V12M125 85V12M145 85V42L166 21V12M165 85V60L202 23H268" />
            <circle cx="87" cy="12" r="3" /><circle cx="125" cy="12" r="3" /><circle cx="268" cy="23" r="3" />
          </g>
        ))}
        <rect x="16" y="16" width="248" height="248" rx="8" strokeDasharray="2 7" />
      </g>
      {layer === 0 && <g className={styles.diagram}>
        <rect x="60" y="78" width="160" height="124" rx="8" />
        <text x="140" y="105">RV32I</text>
        {["IF", "ID", "EX", "MEM", "WB"].map((label, i) => (
          <g key={label}>
            <rect x={69 + i * 29} y="123" width="25" height="35" rx="3" />
            <text x={81.5 + i * 29} y="144" className={styles.smallText}>{label}</text>
          </g>
        ))}
        <path d="M78 174h124m-124 8h85" />
      </g>}
      {layer === 1 && <g className={styles.diagram}>
        <rect x="58" y="69" width="164" height="142" rx="8" />
        <text x="140" y="93">SCHEDULE / STORE</text>
        {[0, 1, 2].map((row) => <g key={row}><path d={`M72 ${116 + row * 20}h136`} /><rect x={80 + row * 31} y={108 + row * 20} width="46" height="10" rx="2" /></g>)}
        <path d="M77 181h30m13 0h30m13 0h30M77 191h30m13 0h30m13 0h30" />
      </g>}
      {layer === 2 && <g className={styles.diagram}>
        {[90, 140, 190].flatMap((x, col) => [104, 140, 176].map((y, row) => <g key={`${col}-${row}`}>
          {col < 2 && [104, 140, 176].map((endY) => <path key={endY} d={`M${x} ${y}L${x + 50} ${endY}`} className={styles.neuralWire} />)}
          <circle cx={x} cy={y} r="7" />
        </g>))}
        <text x="140" y="72">INFERENCE</text><text x="140" y="215" className={styles.smallText}>INPUT → ATTENTION → OUTPUT</text>
      </g>}
      <text x="24" y="249" className={styles.boardNumber}>TM / {layers[layer].number}</text>
    </svg>
  );
}

export function EngineeringStack() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(2);
  const [manualSpread, setManualSpread] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const panelId = useId();
  const current = layers[active];

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktop = window.matchMedia("(min-width: 761px) and (pointer: fine)");
    let frame = 0;
    const update = () => {
      frame = 0;
      let spread = manualSpread ?? 0;
      if (manualSpread === null && desktop.matches && !reducedMotion.matches) {
        const hero = element.closest("section");
        const top = hero?.getBoundingClientRect().top ?? 84;
        spread = Math.max(0, Math.min(1, (84 - top) / 140));
      }
      element.style.setProperty("--spread", String(spread));
      element.dataset.expanded = String(spread > 0.5);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    reducedMotion.addEventListener("change", schedule);
    desktop.addEventListener("change", schedule);
    const observer = new IntersectionObserver(([entry]) => {
      element.dataset.visible = String(entry.isIntersecting);
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reducedMotion.removeEventListener("change", schedule);
      desktop.removeEventListener("change", schedule);
      observer.disconnect();
    };
  }, [manualSpread]);

  function selectLayer(index: number) {
    setActive(index);
    setManualSpread(1);
  }

  return (
    <div ref={root} className={styles.stack} data-paused={paused} data-visible="false"
      onKeyDown={() => { if (root.current) root.current.dataset.keyboard = "true"; }}
      onPointerDown={() => { if (root.current) root.current.dataset.keyboard = "false"; }}>
      <div className={styles.heading}>Silicon to software <span>Select a layer below</span></div>
      <div className={styles.stage} role="group" aria-label="Explorable engineering stack">
        <div className={styles.floor} aria-hidden="true" />
        <div className={styles.guides} aria-hidden="true"><i /><i /><i /></div>
        {layers.map((layer, index) => (
          <div className={`${styles.layer} ${styles[`layer${index}`]}`} key={layer.name} data-active={index === active}>
            <Link href={layer.href} className={styles.board} aria-label={`${layer.name}: ${layer.link}`}
              onFocus={() => selectLayer(index)}>
              <BoardDrawing layer={index} />
              {index === 2 && <div className={styles.lid} aria-hidden="true"><span>tm<span>.</span></span><small>HARDWARE / SOFTWARE</small></div>}
            </Link>
            <span className={styles.layerLabel} aria-hidden="true">{layer.number}<b>{layer.name}</b><span>↗</span></span>
          </div>
        ))}
        <div className={styles.signalTrack} aria-hidden="true" />
        <div className={styles.packet} aria-hidden="true" />
        <div className={styles.output} aria-hidden="true"><span>OUTPUT / NEXT TOKEN</span><code>hello<span className={styles.outputCursor}>_</span></code></div>
      </div>
      <div className={styles.toolbar}>
        <button type="button" className={styles.explore} onClick={() => selectLayer((active + 1) % layers.length)}>
          Show next layer <span aria-hidden="true">↓</span>
        </button>
        <button type="button" className={styles.iconButton} onClick={() => setManualSpread(0)} aria-label="Assemble the stack" title="Assemble the stack">↺</button>
        <button type="button" className={`${styles.iconButton} ${styles.pause}`} onClick={() => setPaused(!paused)} aria-label={paused ? "Play signal animation" : "Pause signal animation"} aria-pressed={paused} title={paused ? "Play signal" : "Pause signal"}>{paused ? "▷" : "Ⅱ"}</button>
      </div>
      <div className={styles.selector} role="group" aria-label="Choose an engineering layer">
        {layers.map((layer, index) => (
          <button key={layer.name} type="button" aria-pressed={active === index} aria-controls={panelId} onClick={() => selectLayer(index)}>
            <span>{layer.number}</span>{layer.name}
          </button>
        ))}
      </div>
      <div id={panelId} className={styles.detail} aria-live="polite" aria-atomic="true">
        <p className={styles.detailPath}>{current.detail}</p>
        <h2>{current.title}</h2>
        <p>{current.description}</p>
        <div className={styles.links}>
          <Link href={current.href}>{current.link} <span aria-hidden="true">↗</span></Link>
          {active === 1 && <Link href="/projects/lsm-storage-engine">Storage engine <span aria-hidden="true">↗</span></Link>}
          {active === 2 && <Link href="/lab/inference">Run it live <span aria-hidden="true">↗</span></Link>}
        </div>
      </div>
      <p className={styles.footnote}>A visual map of my projects · illustrative signal flow</p>
    </div>
  );
}
