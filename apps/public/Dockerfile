# syntax=docker/dockerfile:1.7
# AssurMatch Web Publique Client (Next.js). Topology B.
# Listens on PORT 3601.

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
WORKDIR /app/apps/public
RUN npx next build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3601
WORKDIR /app/apps/public
RUN addgroup -S app && adduser -S app -G app && \
    apk add --no-cache wget
COPY --from=build --chown=app:app /app/node_modules /app/node_modules
COPY --from=build --chown=app:app /app/packages /app/packages
COPY --from=build --chown=app:app /app/apps/public ./
USER app
EXPOSE 3601
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3601}/" >/dev/null || exit 1
CMD ["npx", "next", "start", "-p", "3601"]
