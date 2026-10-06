// In-memory upload fixtures (no binary file committed). The API checks the declared type against
// the magic bytes and scans every upload (EICAR signature scanner in the e2e stack).

/** A tiny but well-formed one-page PDF containing `title`. */
export function pdfFile(name: string, title: string): { name: string; mimeType: string; buffer: Buffer } {
  const text = title.replace(/[()\\]/gu, "");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${`BT /F1 18 Tf 72 760 Td (${text}) Tj ET`.length} >>\nstream\nBT /F1 18 Tf 72 760 Td (${text}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return { name, mimeType: "application/pdf", buffer: Buffer.from(body, "latin1") };
}

/**
 * The EICAR anti-virus test string (harmless by design, detected by every scanner), wrapped as a
 * "PDF" so it passes the type check and reaches the scanner.
 */
export function eicarFile(name: string): { name: string; mimeType: string; buffer: Buffer } {
  const eicar = ["X5O!P%@AP[4\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"].join("");
  return { name, mimeType: "application/pdf", buffer: Buffer.from(`%PDF-1.4\n${eicar}\n%%EOF\n`, "latin1") };
}
