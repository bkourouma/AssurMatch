import { connect } from "node:net";

export interface VirusScanResult {
  verdict: "clean" | "infected" | "failed";
  engine: string;
  signature?: string | undefined;
  detail?: string | undefined;
}

export interface VirusScannerPort {
  readonly engine: string;
  scan(bytes: Buffer): Promise<VirusScanResult>;
}

/** The standard EICAR test string; every antivirus product treats it as a positive. */
const EICAR_SIGNATURE = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

/**
 * Minimal default scanner: rejects the EICAR test file and obvious executable containers hidden
 * behind an allow-listed MIME type. It is a floor, not a replacement for ClamAV in production.
 */
export class EicarSignatureScanner implements VirusScannerPort {
  readonly engine = "eicar-signature";

  async scan(bytes: Buffer): Promise<VirusScanResult> {
    const head = bytes.subarray(0, Math.min(bytes.length, 4096)).toString("latin1");
    if (head.includes(EICAR_SIGNATURE)) return { verdict: "infected", engine: this.engine, signature: "Eicar-Test-Signature" };
    if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return { verdict: "infected", engine: this.engine, signature: "Executable.MZ-header" };
    if (bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) return { verdict: "infected", engine: this.engine, signature: "Executable.ELF-header" };
    return { verdict: "clean", engine: this.engine };
  }
}

/** ClamAV clamd INSTREAM protocol over TCP; no daemon means `failed`, never `clean`. */
export class ClamavTcpScanner implements VirusScannerPort {
  readonly engine = "clamav";

  constructor(private readonly host: string, private readonly port: number, private readonly timeoutMs = 20_000) {}

  scan(bytes: Buffer): Promise<VirusScanResult> {
    return new Promise((resolve) => {
      const socket = connect({ host: this.host, port: this.port });
      const chunks: Buffer[] = [];
      const finish = (result: VirusScanResult) => {
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(this.timeoutMs, () => finish({ verdict: "failed", engine: this.engine, detail: "timeout" }));
      socket.on("error", (error) => finish({ verdict: "failed", engine: this.engine, detail: error.message }));
      socket.on("connect", () => {
        socket.write("zINSTREAM\0");
        const chunkSize = 64 * 1024;
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
          const length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.length, 0);
          socket.write(Buffer.concat([length, chunk]));
        }
        socket.write(Buffer.alloc(4));
      });
      socket.on("data", (data) => chunks.push(Buffer.from(data)));
      socket.on("close", () => {
        const response = Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim();
        if (/\bOK$/.test(response)) return resolve({ verdict: "clean", engine: this.engine });
        const found = /:\s*(.+)\s+FOUND$/.exec(response);
        if (found) return resolve({ verdict: "infected", engine: this.engine, signature: found[1] });
        resolve({ verdict: "failed", engine: this.engine, detail: response || "no_response" });
      });
    });
  }
}
