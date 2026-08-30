import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { bm25 } from "@/lib/search/lexical";
import type { Chunk, LexicalIndex } from "@/lib/search/types";
import TEMPLATE from "../../../../engines/nano/prompts/grounded.v1.json" with { type: "json" };

/**
 * The honest comparison: the same grounded question, answered by a 2.8T model.
 *
 * Kimi K3 cannot run here. At 2.8 trillion parameters it is roughly a terabyte
 * of weights even at four bits, and mixture-of-experts needs every expert
 * resident regardless of which ones a token activates — so it is four orders
 * of magnitude past what a browser tab can hold. The local engine is 129 MB.
 *
 * That gap is the point. Both models get the SAME retrieved passages and the
 * SAME system prompt, so what the page shows is not "big model good" but
 * exactly which failures come from the model and which come from the
 * retrieval — a 135M model that declines and a 2.8T model that answers from
 * the same four paragraphs are telling you something specific.
 *
 * WHY THE SERVER RETRIEVES INSTEAD OF TRUSTING THE CLIENT.
 *
 * The obvious shape is for the browser — which already has the index — to post
 * its passages up. That would make this endpoint a free proxy to a paid API
 * that will relay any text anybody puts in the body. The server does its own
 * retrieval over the same committed corpus, so the prompt is entirely
 * server-controlled and bounded, and the only thing a caller supplies is a
 * question that gets truncated.
 */

export const runtime = "nodejs";

/** Set in the deployment to switch this on. Absent means the whole feature is
 *  off and the UI says so — no key, no route, no bill. */
const KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.COMPARE_MODEL ?? "moonshotai/kimi-k3";

const MAX_QUESTION_CHARS = 300;
const MAX_TOKENS = 400;

/** Per-IP sliding window. Best-effort by construction: serverless functions do
 *  not share memory, so a burst spread across cold starts gets more than this.
 *  It exists to stop the trivial abuse case. The only bound that actually
 *  holds is a spend cap set at the provider — see DEPLOY.md. */
const WINDOW_MS = 60_000;
const PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();   // unbounded map is a slow leak
  return recent.length > PER_WINDOW;
}

let corpus: { chunks: Chunk[]; index: LexicalIndex } | null = null;

function loadCorpus() {
  if (!corpus) {
    const dir = join(process.cwd(), "public", "search");
    corpus = {
      chunks: JSON.parse(readFileSync(join(dir, "chunks.json"), "utf8")),
      index: JSON.parse(readFileSync(join(dir, "lexical.json"), "utf8")),
    };
  }
  return corpus;
}

function fill(pattern: string, vars: Record<string, string>): string {
  return pattern.replace(/\{(\w+)\}/g, (whole, k: string) => vars[k] ?? whole);
}

export async function POST(req: NextRequest) {
  if (!KEY) {
    return Response.json(
      {
        error: "not configured",
        detail:
          "This deployment has no OPENROUTER_API_KEY, so the hosted comparison is off. " +
          "The local model is unaffected — it never needed one.",
      },
      { status: 503 },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) {
    return Response.json(
      { error: "rate limited", detail: `At most ${PER_WINDOW} comparisons a minute.` },
      { status: 429 },
    );
  }

  let question = "";
  try {
    const body = await req.json();
    question = String(body?.question ?? "").slice(0, MAX_QUESTION_CHARS).trim();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (!question) return Response.json({ error: "empty question" }, { status: 400 });

  // Same retrieval, same prompt, same budget as the local model gets.
  const { chunks, index } = loadCorpus();
  const passages = bm25(question, index, chunks, TEMPLATE.budget.maxSources);
  const rendered = passages
    .slice(0, TEMPLATE.budget.maxSources)
    .map((h, i) =>
      fill(TEMPLATE.source, {
        n: String(i + 1),
        title: h.chunk.title,
        section: h.chunk.section,
        text: h.chunk.text,
      }),
    )
    .join(TEMPLATE.sourceSeparator);

  if (!rendered) {
    // Nothing matched, so there is nothing to compare and no reason to spend
    // a request proving it. The local model refuses here too.
    return new Response(TEMPLATE.refusal, {
      headers: { "content-type": "text/plain; charset=utf-8", "x-nano-refused": "retrieval" },
    });
  }

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      // OpenRouter attributes traffic with these; neither is a secret.
      "http-referer": "https://tadiwa.org",
      "x-title": "tadiwa.org inference lab",
    },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      max_tokens: MAX_TOKENS,
      temperature: 0,
      messages: [
        { role: "system", content: fill(TEMPLATE.system, { sources: rendered }) },
        { role: "user", content: question },
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    // Never surface the provider's raw body: it can echo request headers.
    console.error(`compare: upstream ${upstream.status}`, detail.slice(0, 200));
    return Response.json(
      { error: "upstream failed", status: upstream.status },
      { status: 502 },
    );
  }

  // Unwrap SSE into plain text so the client does not need a second parser.
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let carry = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          carry += decoder.decode(value, { stream: true });
          const lines = carry.split("\n");
          carry = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              /* keep-alive comment or a partial frame; the carry handles it */
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-nano-model": MODEL,
      "x-nano-sources": String(passages.length),
    },
  });
}
