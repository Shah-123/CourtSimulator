# Build Stage
#
# node:24-slim, not -alpine: pnpm-workspace.yaml strips every musl variant of
# lightningcss, @tailwindcss/oxide and rollup ("replit uses linux-x64 only"),
# keeping the gnu ones. On Alpine those native modules resolve to nothing and
# the vite build dies. Debian matches what the overrides actually assume.
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

# Every workspace manifest, before the install. Two reasons both bite here:
# `--frozen-lockfile` validates the full importer list against the lockfile, and
# the root `preinstall` hook executes scripts/preinstall.mjs — so a build context
# without scripts/ fails before pnpm resolves a single dependency.
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

# Sources, then the client bundle.
COPY lib ./lib
COPY artifacts/adalat-ai ./artifacts/adalat-ai

RUN pnpm --filter @workspace/adalat-ai run build

# Production Stage: Nginx web server
FROM nginx:alpine

# Remove default nginx configs
RUN rm -rf /etc/nginx/conf.d/default.conf

# Copy compiled public SPA bundle and Nginx reverse proxy configuration
COPY --from=builder /app/artifacts/adalat-ai/dist/public /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
