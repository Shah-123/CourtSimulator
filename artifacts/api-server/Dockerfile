# Build stage
#
# node:24-slim, not -alpine: pnpm-workspace.yaml strips every musl variant of
# lightningcss, @tailwindcss/oxide and rollup ("replit uses linux-x64 only"),
# keeping the gnu ones. On Alpine those native modules resolve to nothing and
# the build dies. Debian matches what the overrides actually assume.
FROM node:24-slim AS builder

WORKDIR /app

# Pinned to the pnpm that produced pnpm-lock.yaml (lockfileVersion 9.0). `latest`
# would make the image non-reproducible on the day of a pnpm major release.
# ca-certificates because corepack fetches pnpm over HTTPS and slim ships no
# guaranteed CA bundle.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@11.18.0 --activate

# Root configuration.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./

# Every workspace manifest, before the install. `--frozen-lockfile` validates the
# full importer list against the lockfile, so omitting a package this image never
# builds (adalat-ai) still fails the install. Manifests only, so that editing
# source does not invalidate the install layer.
COPY scripts/package.json scripts/preinstall.mjs ./scripts/
COPY artifacts/adalat-ai/package.json ./artifacts/adalat-ai/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/
COPY lib/integrations-openai-ai-react/package.json ./lib/integrations-openai-ai-react/
COPY lib/integrations-openai-ai-server/package.json ./lib/integrations-openai-ai-server/

RUN pnpm install --frozen-lockfile

# Sources. `data` carries the statute corpus: scripts/ingest-statutes.mjs resolves
# ../data/statutes, so the db-init container cannot embed the corpus without it.
COPY lib ./lib
COPY scripts ./scripts
COPY artifacts/api-server ./artifacts/api-server
COPY data ./data

# Build api-server bundle with esbuild
RUN pnpm --filter @workspace/api-server run build

# Production image
FROM node:24-slim

WORKDIR /app

# This image is also the db-init runner, whose command shells out to
# `pnpm --filter @workspace/db run push`. corepack does not survive the stage
# boundary — COPY --from carries /app only — so pnpm must be activated again here.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@11.18.0 --activate

COPY --from=builder /app /app

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
