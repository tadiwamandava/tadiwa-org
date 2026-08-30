# tadiwa.org, for Coolify (or any Docker host).
#
# Four stages, because the interesting problem here is not Next but the models.
# The site ships three sets of weights and they have three different origins:
#
#   search index + HNSW wasm   committed, already in the repo
#   MiniLM (22 MB)             pulled from Hugging Face at build
#   Whisper  (42 MB)           pulled from Hugging Face at build
#   SmolLM2  (129 MB)          NOT in git, over GitHub's file limit; supplied
#                              by --build-arg SMOLLM_URL or simply left out
#
# Fetching the two small ones at build keeps them out of git while still
# serving them same-origin, which is the whole point of self-hosting them.

# ---------------------------------------------------------------------------
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` and not `npm install`: the lockfile is the contract, and a build
# that can silently resolve a different tree is a build that can differ from
# the one that passed CI.
RUN npm ci

# ---------------------------------------------------------------------------
# Models. Separate stage so a content-only change does not re-download 64 MB;
# Docker reuses this layer as long as the two scripts and the lockfile are
# unchanged.
FROM deps AS models
WORKDIR /app
COPY scripts ./scripts
COPY content ./content
COPY src ./src
COPY tsconfig.json ./

# Populates node_modules/@huggingface/transformers/.cache, then copies the two
# models into public/models/ so the browser fetches them from this origin
# rather than from a third-party CDN.
RUN npm run build:search && npm run build:voice && npm run build:model

# ---------------------------------------------------------------------------
FROM deps AS builder
WORKDIR /app
COPY . .
COPY --from=models /app/public/models ./public/models
COPY --from=models /app/public/search ./public/search

# The 129 MB int8 SmolLM2 file, if a URL was supplied. Without it the build
# still succeeds and /lab/inference disables that model with a visible reason,
# which is the same graceful path a Vercel deploy took. See DEPLOY.md §5b.
ARG SMOLLM_URL=""
RUN if [ -n "$SMOLLM_URL" ]; then \
      echo "  fetching SmolLM2 weights"; \
      apt-get update && apt-get install -y --no-install-recommends curl \
      && rm -rf /var/lib/apt/lists/*; \
      curl -fsSL "$SMOLLM_URL" -o public/nano/smollm-int8.bin; \
      ls -l public/nano/smollm-int8.bin; \
    else \
      echo "  no SMOLLM_URL: /lab/inference will offer the 359K model only"; \
    fi

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------------------
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Never root. The admin writes files, so the process having exactly the rights
# it needs and no others is load-bearing rather than hygiene.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# `output: "standalone"` traces the server's real imports and emits only those.
# It does NOT include public/ or .next/static, hence the two explicit copies.
# Missing either produces a site that boots and serves no CSS.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# content/ is not a build artefact here. /projects, /resume and every admin
# route are dynamic and read the corpus per request, so the MDX has to exist at
# runtime. It is also the directory the admin writes to.
#
# Two copies on purpose. A volume mounted at /app/content shadows the image's
# copy, so the entrypoint seeds it from /app/content-image the first time it
# finds it empty. Without a volume, /app/content is simply the image's and
# always matches the repo.
COPY --from=builder --chown=nextjs:nodejs /app/content ./content
COPY --from=builder --chown=nextjs:nodejs /app/content ./content-image
COPY --chown=nextjs:nodejs docker-entrypoint.sh /usr/local/bin/entrypoint.sh

USER nextjs
EXPOSE 3000

# Coolify reads this. A container that is up but failing should be reported as
# unhealthy rather than rolled into rotation.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
