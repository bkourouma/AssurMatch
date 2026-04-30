import net from "node:net";
import tls from "node:tls";
import type { AuthEmailPayload } from "./email-delivery.service";

export interface SmtpEmailSenderConfig {
  host: string;
  port: number;
  secure: boolean;
  from: string;
  replyTo?: string;
  username?: string;
  password?: string;
  timeoutMs: number;
}

export class SmtpProtocolError extends Error {
  constructor(readonly code: number, message = "SMTP command failed") {
    super(message);
  }
}

export class SmtpEmailSender {
  constructor(private readonly config: SmtpEmailSenderConfig) {}

  async send(payload: AuthEmailPayload): Promise<void> {
    const socket = await this.connect();
    try {
      const session = new SmtpSession(socket, this.config.timeoutMs);
      await session.expect([220]);
      await session.command(`EHLO ${this.localName()}`, [250]);
      if (this.config.username && this.config.password) {
        const auth = Buffer.from(`\u0000${this.config.username}\u0000${this.config.password}`, "utf8").toString("base64");
        await session.command(`AUTH PLAIN ${auth}`, [235]);
      }
      await session.command(`MAIL FROM:<${extractAddress(this.config.from)}>`, [250]);
      await session.command(`RCPT TO:<${payload.to}>`, [250, 251]);
      await session.command("DATA", [354]);
      await session.writeData(this.message(payload));
      await session.expect([250]);
      await session.command("QUIT", [221]);
    } finally {
      socket.destroy();
    }
  }

  private connect(): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      const socket = this.config.secure
        ? tls.connect({ host: this.config.host, port: this.config.port, servername: this.config.host }, () => resolve(socket))
        : net.connect({ host: this.config.host, port: this.config.port }, () => resolve(socket));
      socket.setTimeout(this.config.timeoutMs, () => {
        socket.destroy(new Error("SMTP timeout"));
      });
      socket.once("error", onError);
    });
  }

  private message(payload: AuthEmailPayload): string {
    const boundary = `assurmatch-${crypto.randomUUID()}`;
    const headers = [
      `From: ${this.config.from}`,
      `To: ${payload.to}`,
      `Subject: ${encodeHeader(payload.subject)}`,
      "MIME-Version: 1.0",
      ...(this.config.replyTo ? [`Reply-To: ${this.config.replyTo}`] : []),
      `Content-Type: multipart/alternative; boundary="${boundary}"`
    ];
    return [
      ...headers,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="utf-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      payload.body,
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      payload.html ?? `<pre>${escapeHtml(payload.body)}</pre>`,
      "",
      `--${boundary}--`,
      ""
    ].join("\r\n");
  }

  private localName(): string {
    return "assurmatch.local";
  }
}

class SmtpSession {
  private buffer = "";
  private pending: {
    expected: number[];
    resolve: () => void;
    reject: (error: Error) => void;
  } | undefined;

  constructor(private readonly socket: net.Socket, private readonly timeoutMs: number) {
    this.socket.on("data", (chunk) => this.onData(chunk.toString("utf8")));
    this.socket.on("error", (error) => this.reject(error));
  }

  async command(command: string, expected: number[]): Promise<void> {
    this.socket.write(`${command}\r\n`, "utf8");
    await this.expect(expected);
  }

  async writeData(message: string): Promise<void> {
    this.socket.write(`${dotEscape(message)}\r\n.\r\n`, "utf8");
  }

  expect(expected: number[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pending = { expected, resolve, reject };
      const timer = setTimeout(() => {
        this.reject(new Error("SMTP timeout"));
      }, this.timeoutMs);
      const previousResolve = resolve;
      const previousReject = reject;
      this.pending.resolve = () => {
        clearTimeout(timer);
        previousResolve();
      };
      this.pending.reject = (error: Error) => {
        clearTimeout(timer);
        previousReject(error);
      };
      this.drain();
    });
  }

  private onData(data: string): void {
    this.buffer += data;
    this.drain();
  }

  private drain(): void {
    if (!this.pending) return;
    const lines = this.buffer.split(/\r?\n/);
    const completeIndex = lines.findIndex((line) => /^\d{3} /.test(line));
    if (completeIndex < 0) return;
    const responseLines = lines.slice(0, completeIndex + 1);
    this.buffer = lines.slice(completeIndex + 1).join("\n");
    const last = responseLines[responseLines.length - 1] ?? "";
    const code = Number(last.slice(0, 3));
    const pending = this.pending;
    this.pending = undefined;
    if (pending.expected.includes(code)) {
      pending.resolve();
    } else {
      pending.reject(new SmtpProtocolError(code));
    }
  }

  private reject(error: Error): void {
    const pending = this.pending;
    this.pending = undefined;
    pending?.reject(error);
  }
}

export function classifySmtpError(error: unknown): string {
  if (error instanceof SmtpProtocolError && error.code === 535) return "smtp_auth_failed";
  if (error instanceof SmtpProtocolError) return "smtp_rejected";
  if (error instanceof Error && error.message.toLowerCase().includes("timeout")) return "smtp_timeout";
  return "smtp_unavailable";
}

function extractAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return match?.[1] ?? value;
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?utf-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function dotEscape(message: string): string {
  return message.replace(/^\./gm, "..");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
