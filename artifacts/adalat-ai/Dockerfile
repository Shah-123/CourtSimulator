# Build Stage
FROM node:24-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy repo configuration and sources
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY lib ./lib
COPY artifacts/adalat-ai ./artifacts/adalat-ai

# Install dependencies and build client bundle
RUN pnpm install --frozen-lockfile
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
