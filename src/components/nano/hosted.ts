/**
 * The hosted comparison — the same grounded question, answered by Kimi K3.
 *
 * This is the one thing on the page that leaves the machine, and it is opt-in
 * per question rather than per session for that reason: a visitor who never
 * presses it never sends anything anywhere and never costs anything.
 *
 * Only the question is sent. The server does its own retrieval over the same
 * committed corpus and builds the prompt itself, so this cannot be used to
 * relay arbitrary text to a paid API — see src/app/api/compare/route.ts.
 */

export type HostedState =
  | { status: "idle" }
  | { status: "streaming"; text: string }
  | { status: "done"; text: string; model: string | null; ms: number }
  | { status: "unavailable"; detail: string }
  | { status: "error"; message: string };

export async function askHosted(
  question: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; model: string | null; ms: number }> {
  const t0 = performance.now();
  const res = await fetch("/api/compare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question }),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { detail?: string; error?: string });
    const detail = body.detail ?? body.error ?? `HTTP ${res.status}`;
    // 503 is "no key on this deployment", which is a configuration state
    // rather than a fault — the caller renders it differently.
    throw Object.assign(new Error(detail), { unavailable: res.status === 503 });
  }

  const model = res.headers.get("x-nano-model");
  let text = "";
  if (res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      text += chunk;
      onChunk(chunk);
    }
  } else {
    text = await res.text();
    onChunk(text);
  }
  return { text, model, ms: performance.now() - t0 };
}
