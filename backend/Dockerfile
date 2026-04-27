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
COPY --from=build --chown=app:app /app/package-lock.json ./package-lock.json
COPY --from=build --chown=app:app /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=build --chown=app:app /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=app:app /app/scripts ./scripts
USER app
EXPOSE 3600
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3600}/countries" >/dev/null || exit 1
# The repo's npm run build is a typecheck only (tsc --noEmit) — no JS is emitted.
# Run the TS source via tsx (same pattern as test:runtime:postgres). A future task may add
# a real JS emission step (tsc emit or nest build) for a smaller runtime image.
CMD ["node", "--import", "tsx", "backend/src/main.ts"]
