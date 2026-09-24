import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface DocumentStoragePort {
  readonly mode: "memory" | "disk" | "s3";
  put(storageKey: string, bytes: Buffer, mimeType: string): Promise<void>;
  get(storageKey: string): Promise<Buffer | undefined>;
  /** Spec 046: removes the stored bytes. A missing object is not an error (anonymization is idempotent). */
  delete(storageKey: string): Promise<void>;
  reference(storageKey: string): string;
}

export class MemoryDocumentStorage implements DocumentStoragePort {
  readonly mode = "memory" as const;
  private readonly files = new Map<string, Buffer>();

  async put(storageKey: string, bytes: Buffer, _mimeType: string): Promise<void> {
    this.files.set(storageKey, Buffer.from(bytes));
  }

  async get(storageKey: string): Promise<Buffer | undefined> {
    return this.files.get(storageKey);
  }

  async delete(storageKey: string): Promise<void> {
    this.files.delete(storageKey);
  }

  reference(storageKey: string): string {
    return `memory://documents/${storageKey}`;
  }
}

/** Local runtime only: files live under an ignored directory, keyed by opaque ids (never by file name). */
export class LocalDiskDocumentStorage implements DocumentStoragePort {
  readonly mode = "disk" as const;

  constructor(private readonly rootDir: string) {}

  async put(storageKey: string, bytes: Buffer, _mimeType: string): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await writeFile(join(this.rootDir, this.safeName(storageKey)), bytes);
  }

  async get(storageKey: string): Promise<Buffer | undefined> {
    return readFile(join(this.rootDir, this.safeName(storageKey))).catch(() => undefined);
  }

  async delete(storageKey: string): Promise<void> {
    await rm(join(this.rootDir, this.safeName(storageKey)), { force: true });
  }

  reference(storageKey: string): string {
    return `file://${join(this.rootDir, this.safeName(storageKey))}`;
  }

  private safeName(storageKey: string): string {
    if (!/^[A-Za-z0-9_.-]+$/.test(storageKey)) throw new Error("Invalid storage key");
    return storageKey;
  }
}

export interface S3StorageConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fetchImpl?: typeof fetch;
}

/** S3-compatible object storage through the REST API signed with AWS SigV4 (no SDK dependency). */
export class S3CompatibleDocumentStorage implements DocumentStoragePort {
  readonly mode = "s3" as const;
  private readonly fetcher: typeof fetch;

  constructor(private readonly config: S3StorageConfig) {
    this.fetcher = config.fetchImpl ?? fetch;
  }

  async put(storageKey: string, bytes: Buffer, mimeType: string): Promise<void> {
    const response = await this.fetcher(this.objectUrl(storageKey), {
      method: "PUT",
      headers: this.signedHeaders("PUT", storageKey, bytes, { "content-type": mimeType }),
      body: new Uint8Array(bytes)
    });
    if (!response.ok) throw new Error(`Document storage upload failed with status ${response.status}`);
  }

  async get(storageKey: string): Promise<Buffer | undefined> {
    const response = await this.fetcher(this.objectUrl(storageKey), { method: "GET", headers: this.signedHeaders("GET", storageKey, Buffer.alloc(0), {}) });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Document storage read failed with status ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(storageKey: string): Promise<void> {
    const response = await this.fetcher(this.objectUrl(storageKey), { method: "DELETE", headers: this.signedHeaders("DELETE", storageKey, Buffer.alloc(0), {}) });
    // S3 answers 204 for a deleted or already absent key; some compatible stores answer 404 instead.
    if (response.status === 404) return;
    if (!response.ok) throw new Error(`Document storage delete failed with status ${response.status}`);
  }

  reference(storageKey: string): string {
    return `s3://${this.config.bucket}/${storageKey}`;
  }

  private objectUrl(storageKey: string): string {
    return `${this.config.endpoint.replace(/\/$/, "")}/${this.config.bucket}/${encodeURIComponent(storageKey)}`;
  }

  private signedHeaders(method: string, storageKey: string, body: Buffer, extra: Record<string, string>): Record<string, string> {
    const url = new URL(this.objectUrl(storageKey));
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash("sha256").update(body).digest("hex");
    const headers: Record<string, string> = { ...extra, host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
    const signedHeaderNames = Object.keys(headers).map((name) => name.toLowerCase()).sort();
    const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]?.trim() ?? ""}\n`).join("");
    const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaderNames.join(";"), payloadHash].join("\n");
    const scope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
    const kDate = createHmac("sha256", `AWS4${this.config.secretAccessKey}`).update(dateStamp).digest();
    const kRegion = createHmac("sha256", kDate).update(this.config.region).digest();
    const kService = createHmac("sha256", kRegion).update("s3").digest();
    const kSigning = createHmac("sha256", kService).update("aws4_request").digest();
    const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
    return {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames.join(";")}, Signature=${signature}`
    };
  }
}
