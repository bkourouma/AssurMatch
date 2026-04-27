# syntax=docker/dockerfile:1.7
# AssurMatch Back-office (Next.js). Packages both apps/admin and apps/broker as the back-office surface.
# Topology B. Listens on PORT 3602 by default for admin; broker is launched separately if needed.
#
# This Dockerfile builds the admin app on port 3602. If the back-office is split into two Next processes
# (admin + broker), use this Dockerfile twice with different build args, or run two containers from a
# combined image — to be finalized in /speckit.tasks. Recommendation: a single container running admin,
# and broker accessible via a sub-path or a second container — chose during implementation.

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
COPY --from=deps /app/node_modules ./node_modules
COPY . .
WORKDIR /app/apps/admin
RUN npx next build
WORKDIR /app/apps/broker
RUN npx next build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3602
WORKDIR /app/apps/admin
RUN addgroup -S app && adduser -S app -G app && \
    apk add --no-cache wget
COPY --from=build --chown=app:app /app/node_modules /app/node_modules
COPY --from=build --chown=app:app /app/packages /app/packages
COPY --from=build --chown=app:app /app/apps/admin /app/apps/admin
COPY --from=build --chown=app:app /app/apps/broker /app/apps/broker
USER app
EXPOSE 3602
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3602}/" >/dev/null || exit 1
# Default: admin on 3602. To run broker too, launch a second container from this image with
# CMD ["npx", "next", "start", "-p", "3603"] in /app/apps/broker.
CMD ["npx", "next", "start", "-p", "3602"]
