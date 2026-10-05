#!/usr/bin/env sh
# Runs `next build` in the current app directory (spec 057).
#
# Next.js inlines every NEXT_PUBLIC_* variable at build time, on the client AND in server code and
# middleware, so the public URLs of an environment are baked into its frontend images. Docker passes
# an ARG that was declared but not provided as an EMPTY string; the apps read these values with
# `process.env.X ?? fallback`, and an empty string would defeat the fallback. Empty values are
# therefore unset before building. A production build refuses to run without its URLs.
set -eu

for name in $(env | sed -n 's/^\(NEXT_PUBLIC_[A-Z0-9_]*\)=$/\1/p'); do
  unset "$name"
done

if [ -n "${REQUIRE_NEXT_PUBLIC:-}" ]; then
  missing=""
  for name in $REQUIRE_NEXT_PUBLIC; do
    eval "value=\${$name:-}"
    if [ -z "$value" ]; then missing="$missing $name"; fi
  done
  if [ -n "$missing" ]; then
    echo "[next-build] missing build arguments:$missing" >&2
    exit 1
  fi
fi

env | grep '^NEXT_PUBLIC_' | sort || true
exec npx next build
