import crypto from "node:crypto";

export class SatisfactionSurveyTokenService {
  generatePublicReference(): string {
    const random = crypto.randomBytes(4).toString("hex").toUpperCase();
    return `SF-${random}`;
  }

  generateToken(): string {
    return crypto.randomBytes(24).toString("base64url");
  }

  hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  verifyToken(token: string, expectedHash: string): boolean {
    const candidateHash = this.hashToken(token);
    try {
      const a = Buffer.from(candidateHash, "hex");
      const b = Buffer.from(expectedHash, "hex");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}
