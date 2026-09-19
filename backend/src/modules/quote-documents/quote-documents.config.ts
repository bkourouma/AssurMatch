import { join } from "node:path";
import { LocalDiskDocumentStorage, MemoryDocumentStorage, S3CompatibleDocumentStorage, type DocumentStoragePort } from "./document-storage.port";
import { ClamavTcpScanner, EicarSignatureScanner, type VirusScannerPort } from "./virus-scanner.port";

/**
 * Storage and scanner selection from the environment. Test runs default to memory; local runtime
 * defaults to an ignored disk folder; production-like environments must opt into S3 explicitly.
 */
export function resolveDocumentStorage(env: Record<string, string | undefined> = process.env): DocumentStoragePort {
  const appEnv = env.APP_ENV ?? env.NODE_ENV ?? "local";
  const mode = env.ASSURMATCH_DOCUMENT_STORAGE ?? (appEnv === "test" ? "memory" : "disk");
  if (mode === "memory") return new MemoryDocumentStorage();
  if (mode === "disk") return new LocalDiskDocumentStorage(env.ASSURMATCH_DOCUMENT_STORAGE_DIR ?? join(process.cwd(), ".local", "documents"));
  if (mode === "s3") {
    const missing = ["ASSURMATCH_S3_ENDPOINT", "ASSURMATCH_S3_BUCKET", "ASSURMATCH_S3_REGION", "ASSURMATCH_S3_ACCESS_KEY_ID", "ASSURMATCH_S3_SECRET_ACCESS_KEY"].filter((key) => !env[key]);
    if (missing.length > 0) throw new Error(`ASSURMATCH_DOCUMENT_STORAGE=s3 requires ${missing.join(", ")}`);
    return new S3CompatibleDocumentStorage({
      endpoint: env.ASSURMATCH_S3_ENDPOINT as string,
      bucket: env.ASSURMATCH_S3_BUCKET as string,
      region: env.ASSURMATCH_S3_REGION as string,
      accessKeyId: env.ASSURMATCH_S3_ACCESS_KEY_ID as string,
      secretAccessKey: env.ASSURMATCH_S3_SECRET_ACCESS_KEY as string
    });
  }
  throw new Error(`Unknown ASSURMATCH_DOCUMENT_STORAGE mode: ${mode}`);
}

export function resolveVirusScanner(env: Record<string, string | undefined> = process.env): VirusScannerPort {
  const mode = env.ASSURMATCH_ANTIVIRUS ?? "eicar";
  if (mode === "eicar") return new EicarSignatureScanner();
  if (mode === "clamav") return new ClamavTcpScanner(env.ASSURMATCH_CLAMAV_HOST ?? "127.0.0.1", Number(env.ASSURMATCH_CLAMAV_PORT ?? "3310"));
  throw new Error(`Unknown ASSURMATCH_ANTIVIRUS mode: ${mode}`);
}

/**
 * Boot-time coherence checks only. Production-like environments without S3 still boot (uploads
 * are flag-gated and off by default); the upload service itself refuses files until durable
 * storage is configured, so the failure stays closed at the feature level rather than at boot.
 */
export function validateDocumentEnvironment(env: Record<string, string | undefined> = process.env): void {
  if (env.ASSURMATCH_DOCUMENT_STORAGE && !["memory", "disk", "s3"].includes(env.ASSURMATCH_DOCUMENT_STORAGE)) {
    throw new Error("ASSURMATCH_DOCUMENT_STORAGE must be memory, disk or s3");
  }
  if (env.ASSURMATCH_DOCUMENT_STORAGE === "s3") resolveDocumentStorage(env);
  if (env.ASSURMATCH_ANTIVIRUS && !["eicar", "clamav"].includes(env.ASSURMATCH_ANTIVIRUS)) {
    throw new Error("ASSURMATCH_ANTIVIRUS must be eicar or clamav");
  }
}
