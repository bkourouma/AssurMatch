/**
 * Magic-bytes check shared by every upload (quote documents, accreditation documents): the
 * declared MIME type must match the first bytes of the file, so a renamed executable is refused
 * before it reaches storage.
 */
export function matchesFileSignature(mimeType: string, bytes: Buffer): boolean {
  if (mimeType === "application/pdf") return bytes.subarray(0, 4).toString("latin1") === "%PDF";
  if (mimeType === "image/jpeg") return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
  if (mimeType === "image/png") return bytes.length > 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return false;
}

/** Keeps the base name only, with a conservative character set; never used as a storage key. */
export function safeUploadFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "document";
  return base.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120) || "document";
}
