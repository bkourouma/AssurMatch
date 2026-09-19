import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalDiskDocumentStorage, MemoryDocumentStorage, S3CompatibleDocumentStorage } from "../../../src/modules/quote-documents/document-storage.port";
import { resolveDocumentStorage, resolveVirusScanner, validateDocumentEnvironment } from "../../../src/modules/quote-documents/quote-documents.config";
import { EicarSignatureScanner } from "../../../src/modules/quote-documents/virus-scanner.port";

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

describe("document scanner and storage ports", () => {
  it("flags EICAR and executable headers, accepts a plain PDF", async () => {
    const scanner = new EicarSignatureScanner();
    expect((await scanner.scan(Buffer.from(`%PDF-1.4\n${EICAR}`))).verdict).toBe("infected");
    expect((await scanner.scan(Buffer.from("MZ\x90\x00", "latin1"))).verdict).toBe("infected");
    expect((await scanner.scan(Buffer.from("%PDF-1.4\n%harmless"))).verdict).toBe("clean");
  });

  it("round-trips bytes through memory and local disk storage with opaque keys only", async () => {
    const memory = new MemoryDocumentStorage();
    await memory.put("qd-1", Buffer.from("abc"), "application/pdf");
    expect((await memory.get("qd-1"))?.toString()).toBe("abc");
    const disk = new LocalDiskDocumentStorage(mkdtempSync(join(tmpdir(), "assurmatch-docs-")));
    await disk.put("qd-2", Buffer.from("xyz"), "image/png");
    expect((await disk.get("qd-2"))?.toString()).toBe("xyz");
    expect(await disk.get("missing")).toBeUndefined();
    await expect(disk.put("../escape", Buffer.from("x"), "image/png")).rejects.toThrow(/Invalid storage key/);
  });

  it("signs S3 PUT requests with SigV4 and never uses the file name as a key", async () => {
    const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    const storage = new S3CompatibleDocumentStorage({
      endpoint: "https://s3.example.test",
      bucket: "assurmatch-docs",
      region: "eu-west-3",
      accessKeyId: "AKIA_TEST",
      secretAccessKey: "secret",
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method ?? "GET", headers: init?.headers as Record<string, string> });
        return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
      }) as typeof fetch
    });
    await storage.put("qd-3", Buffer.from("%PDF-1.4"), "application/pdf");
    expect(calls[0]?.url).toBe("https://s3.example.test/assurmatch-docs/qd-3");
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIA_TEST\/\d{8}\/eu-west-3\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    expect(storage.reference("qd-3")).toBe("s3://assurmatch-docs/qd-3");
  });

  it("resolves adapters from the environment and fails closed in production without S3", () => {
    expect(resolveDocumentStorage({ NODE_ENV: "test" }).mode).toBe("memory");
    expect(resolveDocumentStorage({ APP_ENV: "local" }).mode).toBe("disk");
    expect(resolveVirusScanner({}).engine).toBe("eicar-signature");
    expect(resolveVirusScanner({ ASSURMATCH_ANTIVIRUS: "clamav" }).engine).toBe("clamav");
    // Production without S3 still boots (uploads are flag-gated); incoherent values fail fast.
    expect(() => validateDocumentEnvironment({ APP_ENV: "production" })).not.toThrow();
    expect(() => validateDocumentEnvironment({ APP_ENV: "production", ASSURMATCH_DOCUMENT_STORAGE: "s3" })).toThrow(/requires ASSURMATCH_S3_ENDPOINT/);
    expect(() => validateDocumentEnvironment({ ASSURMATCH_DOCUMENT_STORAGE: "ftp" })).toThrow(/memory, disk or s3/);
    expect(() => validateDocumentEnvironment({ APP_ENV: "local", ASSURMATCH_ANTIVIRUS: "bogus" })).toThrow(/eicar or clamav/);
  });
});
