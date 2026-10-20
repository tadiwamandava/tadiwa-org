"use client";

import Link from "next/link";
import { useId, useState, type CSSProperties, type PointerEvent } from "react";
import styles from "./engineering-stack.module.css";

const layers = [
  { name: "CPU", title: "RISC-V core and verification", href: "/projects/riscv-cpu-verification" },
  { name: "Kernel", title: "STM32 real-time kernel", href: "/projects/rtos-stm32" },
  { name: "Inference", title: "Language-model inference", href: "/projects/llm-inference-engine" },
] as const;

function Circuit({ layer }: { layer: number }) {
  return (
    <svg viewBox="0 0 320 320" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="302" height="302" rx="8" stroke="#46505a" />
      <rect x="14" y="14" width="292" height="292" rx="5" stroke="#222b32" />
      {[0, 90, 180, 270].map((angle) => (
        <g key={angle} transform={`rotate(${angle} 160 160)`}>
          {Array.from({ length: 10 }, (_, i) => {
            const x = 102 + i * 13;
            const end = 42 + i * 25;
            return <g key={i}>
              <path d={`M${x} 108V${73 - (i % 3) * 8}L${end} ${44 - (i % 3) * 8}V19`} stroke={i % 3 === layer ? "#9b7042" : "#394752"} strokeWidth={i % 3 === layer ? "1.4" : "1"} />
              <rect x={end - 2} y="16" width="4" height="8" rx="1" fill="#b29a6b" />
            </g>;
          })}
          {[0, 1, 2, 3].map((i) => <g key={i}>
            <rect x={85 + i * 43} y="65" width="16" height="8" rx="1" fill="#0b1014" stroke="#52606a" strokeWidth=".7" />
            <path d={`M${87 + i * 43} 66v6m12-6v6`} stroke="#a3a5a0" strokeWidth="2" />
          </g>)}
          <circle cx="28" cy="28" r="6" fill="#0c1116" stroke="#756957" strokeWidth="2" />
          <circle cx="28" cy="28" r="2.5" fill="#333c44" />
          {Array.from({ length: 14 }, (_, i) => <rect key={`contact-${i}`} x={108 + i * 8} y="87" width="3" height="11" rx=".8" fill="#c0a675" />)}
        </g>
      ))}
      <rect x="96" y="96" width="128" height="128" rx="4" fill="#080d12" stroke="#7c7156" />
    </svg>
  );
}

function Die({ layer }: { layer: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-silicon`} x2="1" y2="1">
          <stop stopColor="#786c53" /><stop offset=".35" stopColor="#3b494b" /><stop offset=".7" stopColor="#202c36" /><stop offset="1" stopColor="#5d5360" />
        </linearGradient>
        <pattern id={`${id}-etch`} width="3" height="3" patternUnits="userSpaceOnUse">
          <path d="M0 .4H3M.4 0V3" stroke="#c8b98c" strokeWidth=".3" opacity=".45" />
        </pattern>
      </defs>
      <rect x="1" y="1" width="118" height="118" fill={`url(#${id}-silicon)`} stroke="#b9b194" />
      {layer === 2 && Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (_, col) => <g key={`${row}-${col}`}>
        <rect x={8 + col * 27} y={8 + row * 27} width="23" height="23" fill="#192831" stroke="#b5a77e" strokeWidth=".6" />
        <rect x={10 + col * 27} y={10 + row * 27} width="19" height="19" fill={`url(#${id}-etch)`} />
      </g>))}
      {layer === 0 && Array.from({ length: 5 }, (_, col) => <g key={col}>
        <rect x={8 + col * 21} y="8" width="17" height={col % 2 ? 62 : 78} fill="#192831" stroke="#b5a77e" strokeWidth=".7" />
        <rect x={10 + col * 21} y="10" width="13" height={col % 2 ? 58 : 74} fill={`url(#${id}-etch)`} />
        <path d={`M${16 + col * 21} 89v15h${col % 2 ? 8 : -8}`} stroke="#c0a06a" strokeWidth=".7" />
      </g>)}
      {layer === 1 && <g>
        <rect x="30" y="30" width="60" height="60" fill="#192831" stroke="#b5a77e" />
        <rect x="34" y="34" width="52" height="52" fill={`url(#${id}-etch)`} />
        {[0, 90, 180, 270].map((angle) => <g key={angle} transform={`rotate(${angle} 60 60)`}>
          <rect x="9" y="9" width="102" height="13" fill="#252b32" stroke="#978d71" strokeWidth=".5" />
          {Array.from({ length: 13 }, (_, i) => <path key={i} d={`M${12 + i * 8} 10v11`} stroke="#a69e7a" strokeWidth=".6" />)}
          <path d="M40 23v6m10-6v6m10-6v6m10-6v6m10-6v6" stroke="#d2ac72" strokeWidth=".7" />
        </g>)}
      </g>}
      <path d="M4 16V4h12M104 116h12v-12" stroke="#e1d7b9" strokeWidth="1.5" />
    </svg>
  );
}

function Mounts() {
  return (
    <span className={styles.mounts} aria-hidden="true">
      {[0, 1, 2, 3].map((corner) => (
        <span className={styles.mount} key={corner}>
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M7 3.4h10l5 8.6-5 8.6H7L2 12Z" fill="#66717a" stroke="#a9b0b2" strokeWidth=".7" />
            <circle cx="12" cy="12" r="6.2" fill="#252f38" stroke="#9b947d" strokeWidth=".8" />
            <path d="m9 7 6 10M7 9l10 6" stroke="#0c1319" strokeWidth="1.8" />
            <path d="m7 4 10 .1 4 7" stroke="#c9ccbf" strokeWidth=".7" />
          </svg>
        </span>
      ))}
    </span>
  );
}

export function EngineeringStack() {
  const [active, setActive] = useState(2);
  const panelId = useId();
  function tilt(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5));
    const y = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5));
    event.currentTarget.style.setProperty("--pitch", `${57 - y * 6}deg`);
    event.currentTarget.style.setProperty("--turn", `${-37 + x * 8}deg`);
    event.currentTarget.style.setProperty("--reflection", `${45 + x * 35}%`);
  }
  function resetTilt(event: PointerEvent<HTMLDivElement>) {
    for (const name of ["--pitch", "--turn", "--reflection"]) event.currentTarget.style.removeProperty(name);
  }
  return (
    <div className={styles.stack} style={{ "--active-layer": active } as CSSProperties}>
      <div className={styles.stage} role="group" aria-label="Engineering project stack" onPointerMove={tilt} onPointerLeave={resetTilt}>
        <div className={styles.light} aria-hidden="true" />
        <div className={styles.assembly}>
          <div className={styles.shadow} aria-hidden="true" />
          {layers.map((layer, index) => (
            <div key={layer.name} className={`${styles.layer} ${styles[`layer${index}`]}`} data-active={active === index}>
              <span className={styles.front} aria-hidden="true" /><span className={styles.back} aria-hidden="true" />
              <span className={styles.left} aria-hidden="true" /><span className={styles.right} aria-hidden="true" />
              <Link href={layer.href} className={styles.board} aria-label={layer.title} onFocus={() => setActive(index)}>
                <Circuit layer={index} />
                <Mounts />
                <span className={styles.package} aria-hidden="true">
                  <span className={styles.packageFront} /><span className={styles.packageSide} />
                  <span className={styles.die}><Die layer={index} /></span>
                </span>
              </Link>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.selector} role="group" aria-label="Choose an engineering layer">
        {layers.map((layer, index) => (
          <button key={layer.name} type="button" aria-pressed={active === index} aria-controls={panelId} onClick={() => setActive(index)}>{layer.name}</button>
        ))}
      </div>
      <div className={styles.detail} id={panelId} aria-live="polite" aria-atomic="true">
        <Link href={layers[active].href}>{layers[active].title}<span aria-hidden="true">↗</span></Link>
      </div>
    </div>
  );
}
