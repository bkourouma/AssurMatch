# syntax=docker/dockerfile:1.7
# AssurMatch backend API image. Topology B (3 containers).
# Listens on PORT 3600. Stateless. Health: GET /admin/system/health.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/broker/package.json apps/broker/package.json
COPY apps/public/package.json apps/public/package.json
COPY packages packages
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
# Placeholder DATABASE_URL satisfies prisma.config.ts at build time.
# The real DATABASE_URL is injected at runtime via the env file.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema backend/prisma/schema.prisma
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3600
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app && \
    apk add --no-cache wget
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/backend ./backend
COPY --from=build --chown=app:app /app/packages ./packages
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/tsconfig.base.json ./tsconfig.base.json
USER app
EXPOSE 3600
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3600}/admin/system/health" >/dev/null || exit 1
# Bootstrap is selected at /speckit.tasks: Nest emits to backend/dist/main.js (typical) — adjust if differs.
CMD ["node", "backend/dist/main.js"]
