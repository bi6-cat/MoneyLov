# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps apps
RUN pnpm --filter @moneylov/core test && pnpm --filter @moneylov/web build

FROM node:22-alpine
ENV NODE_ENV=production PORT=8787 WEB_DIR=/app/apps/web/dist
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "--import", "tsx", "src/index.ts"]
