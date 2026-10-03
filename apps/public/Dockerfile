# syntax=docker/dockerfile:1.7
# AssurMatch Web Publique Client (Next.js). Listens on PORT 3601.
#
# NEXT_PUBLIC_* values are inlined by `next build`: build one image per environment.
#   docker build -f apps/public/Dockerfile \
#     --build-arg NEXT_PUBLIC_ASSURMATCH_API_URL=https://api.<domain> \
#     --build-arg NEXT_PUBLIC_ASSURMATCH_PUBLIC_URL=https://<domain> \
#     --build-arg NEXT_PUBLIC_ASSURMATCH_BROKER_URL=https://pro.<domain> \
#     -t assurmatch-public:local .

FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/broker/package.json apps/broker/package.json
COPY apps/public/package.json apps/public/package.json
COPY packages packages
RUN npm ci

FROM node:26-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_ASSURMATCH_API_URL
ARG NEXT_PUBLIC_ASSURMATCH_PUBLIC_URL
ARG NEXT_PUBLIC_ASSURMATCH_BROKER_URL
# Space-separated list of NEXT_PUBLIC_* that must be non-empty (set by CI for production builds).
ARG REQUIRE_NEXT_PUBLIC
COPY --from=deps /app/node_modules ./node_modules
COPY . .
WORKDIR /app/apps/public
RUN sh /app/scripts/ops/next-build.sh

FROM node:26-alpine AS runtime
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
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:3601/" >/dev/null || exit 1
# Fixed port: the preproduction deploy shares one env file whose PORT is the API's (3600).
CMD ["npx", "next", "start", "-p", "3601"]
