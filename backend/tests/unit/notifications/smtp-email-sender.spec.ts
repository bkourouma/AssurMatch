import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { classifySmtpError, SmtpEmailSender, SmtpProtocolError } from "../../../src/modules/notifications/email/smtp-email-sender";

const servers: net.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers.length = 0;
});

describe("SmtpEmailSender", () => {
  it("sends a multipart message to a plain SMTP server", async () => {
    const received = await withSmtpServer(async (port, messages) => {
      const sender = new SmtpEmailSender({
        host: "127.0.0.1",
        port,
        secure: false,
        from: "AssurMatch <no-reply@example.test>",
        timeoutMs: 1000
      });

      await sender.send({
        to: "user@example.test",
        subject: "Activation de votre acces AssurMatch",
        body: "Jeton temporaire: token-123",
        html: "<p>Jeton temporaire: token-123</p>",
        purpose: "auth_activation"
      });
      return messages.join("\n");
    });

    expect(received).toContain("MAIL FROM:<no-reply@example.test>");
    expect(received).toContain("RCPT TO:<user@example.test>");
    expect(received).toContain("Subject: Activation de votre acces AssurMatch");
    expect(received).toContain("Jeton temporaire: token-123");
  });

  it("classifies SMTP auth failures without exposing provider details", async () => {
    await expect(withSmtpServer(async (port) => {
      const sender = new SmtpEmailSender({
        host: "127.0.0.1",
        port,
        secure: false,
        from: "no-reply@example.test",
        username: "sender@example.test",
        password: "runtime-only-secret",
        timeoutMs: 1000
      });
      await sender.send({
        to: "user@example.test",
        subject: "Reset",
        body: "Reset body",
        purpose: "auth_password_reset"
      });
    }, { rejectAuth: true })).rejects.toBeInstanceOf(SmtpProtocolError);

    expect(classifySmtpError(new SmtpProtocolError(535, "bad credentials runtime-only-secret"))).toBe("smtp_auth_failed");
  });
});

async function withSmtpServer<T>(
  callback: (port: number, messages: string[]) => Promise<T>,
  options: { rejectAuth?: boolean } = {}
): Promise<T> {
  const messages: string[] = [];
  const server = net.createServer((socket) => {
    socket.write("220 mock.smtp.local\r\n");
    let buffer = "";
    let dataMode = false;
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      while (buffer.includes("\r\n")) {
        const index = buffer.indexOf("\r\n");
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (dataMode) {
          if (line === ".") {
            dataMode = false;
            socket.write("250 queued\r\n");
          } else {
            messages.push(line);
          }
          continue;
        }
        messages.push(line);
        if (line.startsWith("EHLO")) socket.write("250 mock.smtp.local\r\n");
        else if (line.startsWith("AUTH")) socket.write(options.rejectAuth ? "535 auth failed\r\n" : "235 authenticated\r\n");
        else if (line.startsWith("MAIL FROM")) socket.write("250 ok\r\n");
        else if (line.startsWith("RCPT TO")) socket.write("250 ok\r\n");
        else if (line === "DATA") {
          dataMode = true;
          socket.write("354 end with dot\r\n");
        } else if (line === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        }
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("SMTP test server did not bind");
  return callback(address.port, messages);
}
