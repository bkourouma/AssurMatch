import { createHash } from "node:crypto";
import { matchesFileSignature, safeUploadFileName } from "../common/files/file-signature";
import type { DocumentStoragePort } from "../quote-documents/document-storage.port";
import type { VirusScannerPort } from "../quote-documents/virus-scanner.port";

/** Shape multer hands over for a multipart `file` field (same as quote and accreditation documents). */
export interface UploadedLeadFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface ScannedUploadDeps {
  storage: DocumentStoragePort;
  scanner: VirusScannerPort;
  /** Production-like runtimes refuse uploads unless the storage is durable (S3), as for spec 033/051. */
  requireDurableStorage?: boolean | undefined;
}

export interface StoredScannedFile {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  scanStatus: "clean";
  scanEngine: string;
  scannedAt: Date;
}

export type ScannedUploadRefusal =
  | "storage_not_configured"
  | "file_missing"
  | "file_too_large"
  | "mime_not_allowed"
  | "content_mismatch"
  | "infected"
  | "scan_failed";

export type ScannedUploadResult =
  | { ok: true; file: StoredScannedFile }
  | { ok: false; refusal: ScannedUploadRefusal; signature?: string | undefined; engine?: string | undefined };

/**
 * Spec 055 (reusing specs 033/051): MIME allow-list, signature bytes, size limit, sha256, storage,
 * then a synchronous antivirus scan. Anything that is not clean is deleted at once and refused, so
 * an infected or unscanned file is never referenced, hence never served (SC-005).
 */
export async function storeScannedFile(
  deps: ScannedUploadDeps,
  file: UploadedLeadFile | undefined,
  rules: { allowedMimeTypes: readonly string[]; maxBytes: number; keyPrefix: string }
): Promise<ScannedUploadResult> {
  if (deps.requireDurableStorage && deps.storage.mode !== "s3") return { ok: false, refusal: "storage_not_configured" };
  if (!file || file.size === 0 || file.buffer.length === 0) return { ok: false, refusal: "file_missing" };
  if (file.size > rules.maxBytes || file.buffer.length > rules.maxBytes) return { ok: false, refusal: "file_too_large" };
  const mimeType = file.mimetype.toLowerCase();
  if (!rules.allowedMimeTypes.includes(mimeType)) return { ok: false, refusal: "mime_not_allowed" };
  if (!matchesFileSignature(mimeType, file.buffer)) return { ok: false, refusal: "content_mismatch" };

  const storageKey = `${rules.keyPrefix}-${crypto.randomUUID()}`;
  await deps.storage.put(storageKey, file.buffer, mimeType);
  const result = await deps.scanner.scan(file.buffer);
  if (result.verdict !== "clean") {
    await deps.storage.delete(storageKey).catch(() => undefined);
    return { ok: false, refusal: result.verdict === "infected" ? "infected" : "scan_failed", signature: result.signature ?? result.detail, engine: result.engine };
  }
  return {
    ok: true,
    file: {
      storageKey,
      fileName: safeUploadFileName(file.originalname),
      mimeType,
      sizeBytes: file.buffer.length,
      checksum: `sha256:${createHash("sha256").update(file.buffer).digest("hex")}`,
      scanStatus: "clean",
      scanEngine: result.engine,
      scannedAt: new Date()
    }
  };
}
