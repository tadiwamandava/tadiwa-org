"use client";

import { useId, useState } from "react";
import { Bar, Caption, Panel, fmt } from "./parts";
import type { LayerStats, Projection } from "@/lib/search/stats";
import type { Chunk } from "@/lib/search/types";

/**
 * The graph, drawn.
 *
 * Two things are on screen and they are not the same kind of thing, which is
 * the whole reason for the caption:
 *
 *   · The LAYERS, EDGES, DEGREES and ENTRY POINT are data. They come straight
 *     out of the index and are exact.
 *   · The POSITIONS are a choice. These are 384-dimensional unit vectors, and
 *     no 2-D placement of them is the truth. This one is the first two
 *     principal components, which is the least arbitrary linear choice
 *     available and comes with a number, the fraction of variance the two
 *     drawn axes actually carry, printed underneath.
 *
 * A picture of a high-dimensional index that does not say which half is real
 * is a picture that misleads on purpose.
 */

const VIEW_W = 420;
const VIEW_H = 270;
const PAD = 16;

export function GraphMap({
  layers,
  projection,
  edgesByLayer,
  membersByLayer,
  entryPoint,
  chunks,
  path,
  topHit,
}: {
  layers: LayerStats[];
  projection: Projection;
  edgesByLayer: Array<Array<[number, number]>>;
  membersByLayer: number[][];
  entryPoint: number | undefined;
  chunks: Chunk[];
  path: Array<{ layer: number; node: number }>;
  topHit: number | null;
}) {
  const topLayer = layers.length - 1;
  const [layer, setLayer] = useState(topLayer);
  const groupId = useId();

  const stats = layers[layer];
  const members = new Set(membersByLayer[layer] ?? []);
  const edges = edgesByLayer[layer] ?? [];

  // Equal scale on both axes. Stretching one to fill the box would make the
  // cloud look better and the distances lie harder.
  const { xs, ys } = projection;
  const n = xs.length;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (xs[i] < minX) minX = xs[i];
    if (xs[i] > maxX) maxX = xs[i];
    if (ys[i] < minY) minY = ys[i];
    if (ys[i] > maxY) maxY = ys[i];
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((VIEW_W - PAD * 2) / spanX, (VIEW_H - PAD * 2) / spanY);
  const offX = (VIEW_W - spanX * scale) / 2;
  const offY = (VIEW_H - spanY * scale) / 2;
  const px = (i: number) => offX + (xs[i] - minX) * scale;
  // SVG y grows downward; flip so the projection is not mirrored against the
  // numbers anyone might compute from the same vectors.
  const py = (i: number) => VIEW_H - (offY + (ys[i] - minY) * scale);

  const pathNodes = path.map((p) => p.node);
  const label = (id: number) => chunks[id]?.title ?? `node ${id}`;

  return (
    <>
      <Panel className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
          <div>
            <h3 className="font-display text-lg">Layer {layer}</h3>
            <p className="mt-0.5 font-mono text-2xs text-subtle tabular-nums">
              {fmt.count(stats.nodes)} nodes · {fmt.count(stats.edges)} edges · mean degree{" "}
              {stats.meanDegree.toFixed(1)}
            </p>
          </div>

          <fieldset className="flex items-center gap-px overflow-hidden rounded-md border border-border-strong">
            <legend className="sr-only">Which layer to draw</legend>
            {layers
              .map((l) => l.layer)
              .reverse()
              .map((l) => (
                <label
                  key={l}
                  className={`cursor-pointer px-3 py-1.5 font-mono text-2xs tracking-wide transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-accent ${
                    l === layer
                      ? "bg-accent text-accent-contrast"
                      : "bg-surface-2 text-muted hover:text-text"
                  }`}
                >
                  <input
                    type="radio"
                    name={groupId}
                    className="sr-only"
                    checked={l === layer}
                    onChange={() => setLayer(l)}
                  />
                  Layer {l}
                </label>
              ))}
          </fieldset>
        </div>

        <figure className="mt-4">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="block h-auto w-full rounded-md border border-border bg-bg"
            role="img"
            aria-label={`Layer ${layer} of the index: ${stats.nodes} of ${
              layers[0].nodes
            } nodes, ${stats.edges} edges, drawn at their first two principal components. ${
              entryPoint === undefined ? "" : `The entry point is node ${entryPoint}.`
            } Exact figures are in the tables below.`}
          >
            {/* Edges first, so nodes sit on top of them. */}
            <g
              stroke="var(--chart-reference)"
              strokeWidth={edges.length > 200 ? 0.4 : 0.9}
              opacity={edges.length > 200 ? 0.35 : 0.8}
            >
              {edges.map(([a, b]) => (
                <line key={`${a}-${b}`} x1={px(a)} y1={py(a)} x2={px(b)} y2={py(b)} />
              ))}
            </g>

            {/* Every node in the corpus, so the selected layer is seen as a
                subset of something rather than floating on its own. */}
            <g>
              {Array.from({ length: n }, (_, i) => {
                const inLayer = members.has(i);
                return (
                  <circle
                    key={i}
                    cx={px(i)}
                    cy={py(i)}
                    r={inLayer ? 3.6 : 1.8}
                    fill={inLayer ? "var(--chart-mine)" : "var(--chart-reference)"}
                    opacity={inLayer ? 1 : 0.55}
                  />
                );
              })}
            </g>

            {/* The descent, if a query has been run. Dashed, numbered, and
                drawn across layers on purpose: it is the one thing on this
                picture that is a sequence. */}
            {pathNodes.length > 1 && (
              <polyline
                points={pathNodes.map((id) => `${px(id)},${py(id)}`).join(" ")}
                fill="none"
                stroke="var(--chart-mine)"
                strokeWidth={1.2}
                strokeDasharray="4 3"
                opacity={0.9}
              />
            )}
            {pathNodes.map((id, i) => (
              <g key={`p${i}-${id}`}>
                <circle
                  cx={px(id)}
                  cy={py(id)}
                  r={6}
                  fill="none"
                  stroke="var(--chart-mine)"
                  strokeWidth={1.4}
                />
                <text
                  x={px(id) + 9}
                  y={py(id) + 3}
                  fontSize={8}
                  className="fill-current font-mono text-text"
                >
                  {i + 1}
                </text>
              </g>
            ))}

            {topHit !== null && (
              <g>
                <rect
                  x={px(topHit) - 6}
                  y={py(topHit) - 6}
                  width={12}
                  height={12}
                  fill="none"
                  stroke="var(--chart-mine)"
                  strokeWidth={1.4}
                />
                <text
                  x={px(topHit) + 10}
                  y={py(topHit) - 7}
                  fontSize={8}
                  className="fill-current font-mono text-muted"
                >
                  best
                </text>
              </g>
            )}

            {entryPoint !== undefined && (
              <g>
                <circle
                  cx={px(entryPoint)}
                  cy={py(entryPoint)}
                  r={8.5}
                  fill="none"
                  stroke="var(--text)"
                  strokeWidth={1.2}
                />
                <text
                  x={px(entryPoint) + 12}
                  y={py(entryPoint) + 3.5}
                  fontSize={8.5}
                  className="fill-current font-mono text-text"
                >
                  entry
                </text>
              </g>
            )}
          </svg>

          <figcaption className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-subtle">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-chart-mine" aria-hidden />
              present at layer {layer}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-chart-reference" aria-hidden />
              in the corpus, not at this layer
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full border border-text"
                aria-hidden
              />
              entry point (node {entryPoint ?? ", "})
            </span>
            {pathNodes.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-full border border-chart-mine"
                  aria-hidden
                />
                numbered: where the last query&rsquo;s descent landed
              </span>
            )}
          </figcaption>
        </figure>

        <Caption>
          <strong className="font-medium text-muted">
            The positions are a layout choice; the layers and edges are not.
          </strong>{" "}
          These vectors have 384 dimensions. The dots are placed at their first
          two principal components, which carry{" "}
          <span className="font-mono tabular-nums">{fmt.pct(projection.explained)}</span> of
          the corpus&rsquo;s variance, the other{" "}
          <span className="font-mono tabular-nums">{fmt.pct(1 - projection.explained)}</span>{" "}
          is not on this screen. Two dots that look close here may be far apart in
          the space the graph actually searches, and an edge that looks long may
          be a short one. What is exact: which nodes reach which layer, which
          nodes are linked, and where the walk went.
        </Caption>
      </Panel>

      <div className="mt-4">
        <LayerTable layers={layers} selected={layer} />
      </div>

      {path.length > 0 && (
        <Panel className="mt-4">
          <h3 className="font-mono text-2xs tracking-[0.12em] text-muted uppercase">
            The last descent
          </h3>
          <ol className="mt-3 space-y-1.5">
            {path.map((p, i) => (
              <li key={`${p.layer}-${p.node}-${i}`} className="flex gap-3 text-sm">
                <span className="w-16 shrink-0 font-mono text-2xs text-subtle tabular-nums">
                  layer {p.layer}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted">
                  <span className="font-mono text-2xs text-subtle tabular-nums">
                    #{p.node}
                  </span>{" "}
                  {label(p.node)}
                </span>
              </li>
            ))}
          </ol>
          <Caption>
            Greedy descent takes one nearest step per layer until layer 0, where
            the wide <span className="font-mono">ef</span> sweep happens. With{" "}
            {layers.length} layers that is a short list, which is the point of
            the hierarchy, not a shortcoming of this corpus.
          </Caption>
        </Panel>
      )}
    </>
  );
}

function LayerTable({ layers, selected }: { layers: LayerStats[]; selected: number }) {
  const max = Math.max(...layers.map((l) => l.nodes));
  return (
    <Panel>
      <h3 className="font-mono text-2xs tracking-[0.12em] text-muted uppercase">
        The pyramid
      </h3>
      <table className="mt-3 w-full border-collapse">
        <caption className="sr-only">
          Nodes and edges per layer, layer 0 holding every node.
        </caption>
        <thead>
          <tr className="text-left font-mono text-2xs text-subtle uppercase">
            <th scope="col" className="pb-1.5 font-normal">
              Layer
            </th>
            <th scope="col" className="pb-1.5 font-normal">
              Nodes
            </th>
            <th scope="col" className="pb-1.5 text-right font-normal">
              Edges
            </th>
          </tr>
        </thead>
        <tbody>
          {[...layers].reverse().map((l) => (
            <tr
              key={l.layer}
              aria-current={l.layer === selected ? "true" : undefined}
              className={l.layer === selected ? "bg-surface-2" : undefined}
            >
              <th
                scope="row"
                className="w-12 py-1.5 pr-2 text-left font-mono text-xs font-normal text-muted tabular-nums"
              >
                {l.layer}
              </th>
              <td className="py-1.5 pr-3">
                <div className="flex items-center gap-2">
                  <Bar pct={(l.nodes / max) * 100} />
                  <span className="shrink-0 font-mono text-xs tabular-nums">{l.nodes}</span>
                </div>
              </td>
              <td className="py-1.5 text-right font-mono text-xs text-muted tabular-nums">
                {fmt.count(l.edges)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Caption>
        Each node draws its own top layer from an exponentially decaying
        distribution, so the pyramid narrows by roughly a factor of M per step
        without anyone deciding the shape. Layer 0 always holds everything.
      </Caption>
    </Panel>
  );
}
