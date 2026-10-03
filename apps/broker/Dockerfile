# syntax=docker/dockerfile:1.7
# AssurMatch Broker Back-office (Next.js) — spec 057, PRD K-02.
# Separate authenticated app, separate container, separate domain. Listens on PORT 3603.
#
# NEXT_PUBLIC_* values are inlined by `next build`: build one image per environment.
#   docker build -f apps/broker/Dockerfile \
#     --build-arg NEXT_PUBLIC_ASSURMATCH_API_URL=https://api.<domain> \
#     --build-arg NEXT_PUBLIC_ASSURMATCH_BROKER_API_URL=https://api.<domain> \
#     -t assurmatch-broker:local .

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
ARG NEXT_PUBLIC_ASSURMATCH_API_URL
ARG NEXT_PUBLIC_ASSURMATCH_BROKER_API_URL
ARG NEXT_PUBLIC_APP_ENV
# Space-separated list of NEXT_PUBLIC_* that must be non-empty (set by CI for production builds).
ARG REQUIRE_NEXT_PUBLIC
# The local demo login picker imports @prisma/client, so the client must be generated before
# `next build` type-checks it. Placeholder DATABASE_URL satisfies prisma.config.ts at build time;
# the broker container never receives a DATABASE_URL at runtime (the picker is local-only).
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema backend/prisma/schema.prisma
WORKDIR /app/apps/broker
RUN sh /app/scripts/ops/next-build.sh

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3603
WORKDIR /app/apps/broker
RUN addgroup -S app && adduser -S app -G app && \
    apk add --no-cache wget
COPY --from=build --chown=app:app /app/node_modules /app/node_modules
COPY --from=build --chown=app:app /app/packages /app/packages
COPY --from=build --chown=app:app /app/apps/broker /app/apps/broker
USER app
EXPOSE 3603
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:3603/login" >/dev/null || exit 1
# Fixed port: the preproduction deploy shares one env file whose PORT is the API's (3600).
CMD ["npx", "next", "start", "-p", "3603"]
