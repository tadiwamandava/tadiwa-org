import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Liveness for the container orchestrator.
 *
 * It checks the two things that can be wrong while the process is still
 * happily listening, both of which have actually happened during this build:
 *
 *   content/    is a runtime dependency, not a build artefact. /projects,
 *               /resume and every admin route read it per request. A missing
 *               COPY in the Dockerfile gives a server that boots and then 500s
 *               on half its routes.
 *   .next/static  is not included by `output: "standalone"`. Forgetting it
 *               yields a site that renders and has no CSS, which reads as a
 *               styling bug rather than a packaging one.
 *
 * Deliberately not checked: the model weights. Those are optional by design
 * and the pages degrade with a visible reason when they are absent, so an
 * unhealthy container is the wrong way to report them.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const checks = {
    content: existsSync(join(process.cwd(), "content", "projects")),
    staticAssets: existsSync(join(process.cwd(), ".next", "static")),
  };
  const ok = Object.values(checks).every(Boolean);

  return Response.json(
    { ok, checks, uptimeSeconds: Math.round(process.uptime()) },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
