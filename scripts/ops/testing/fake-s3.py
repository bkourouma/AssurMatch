#!/usr/bin/env python3
"""Minimal S3-compatible endpoint for backup/restore drills without a provider (spec 058 FR-005).

Path-style only: PUT/GET/DELETE /<bucket>/<key> and GET /<bucket>?list-type=2&prefix=...
Requests must carry an AWS SigV4 Authorization header (checked for presence and access key id,
not cryptographically verified). Objects are stored under the directory given as first argument.
NOT a storage service: drills and CI only.

    python3 scripts/ops/testing/fake-s3.py /tmp/fake-s3 9555 drill-access-key
"""
import os
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse
from xml.sax.saxutils import escape

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "/tmp/fake-s3")
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 9555
ACCESS_KEY = sys.argv[3] if len(sys.argv) > 3 else ""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # quiet
        pass

    def _authorized(self):
        auth = self.headers.get("Authorization", "")
        ok = auth.startswith("AWS4-HMAC-SHA256 ") and (not ACCESS_KEY or f"Credential={ACCESS_KEY}/" in auth)
        if not ok:
            self.send_response(403)
            self.end_headers()
        return ok

    def _path(self):
        parsed = urlparse(self.path)
        parts = unquote(parsed.path).lstrip("/").split("/", 1)
        bucket = parts[0]
        key = parts[1] if len(parts) > 1 else ""
        if ".." in key.split("/"):
            raise ValueError("bad key")
        return bucket, key, parse_qs(parsed.query)

    def do_PUT(self):
        if not self._authorized():
            return
        bucket, key, _ = self._path()
        target = os.path.join(ROOT, bucket, key)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        length = int(self.headers.get("Content-Length", "0"))
        remaining = length
        with open(target, "wb") as handle:
            while remaining > 0:
                chunk = self.rfile.read(min(remaining, 1 << 20))
                if not chunk:
                    break
                handle.write(chunk)
                remaining -= len(chunk)
        self.send_response(200)
        self.send_header("ETag", '"fake"')
        self.end_headers()

    def do_GET(self):
        if not self._authorized():
            return
        bucket, key, query = self._path()
        if not key:
            prefix = query.get("prefix", [""])[0]
            base = os.path.join(ROOT, bucket)
            keys = []
            for directory, _, files in os.walk(base):
                for name in files:
                    rel = os.path.relpath(os.path.join(directory, name), base).replace(os.sep, "/")
                    if rel.startswith(prefix):
                        keys.append(rel)
            body = "".join(
                f"<Contents><Key>{escape(k)}</Key><LastModified>{datetime.now(timezone.utc).isoformat()}</LastModified></Contents>"
                for k in sorted(keys)
            )
            xml = f'<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>{escape(bucket)}</Name><IsTruncated>false</IsTruncated>{body}</ListBucketResult>'
            data = xml.encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/xml")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        target = os.path.join(ROOT, bucket, key)
        if not os.path.isfile(target):
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Length", str(os.path.getsize(target)))
        self.end_headers()
        with open(target, "rb") as handle:
            while True:
                chunk = handle.read(1 << 20)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def do_DELETE(self):
        if not self._authorized():
            return
        bucket, key, _ = self._path()
        target = os.path.join(ROOT, bucket, key)
        if os.path.isfile(target):
            os.remove(target)
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    os.makedirs(ROOT, exist_ok=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
