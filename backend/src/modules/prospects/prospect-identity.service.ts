import { createHash } from "node:crypto";

export interface NormalizedProspectContact {
  displayName?: string;
  emailNormalized: string;
  phoneNormalized: string;
  emailFingerprint: string;
  phoneFingerprint: string;
}

export class ProspectIdentityService {
  normalize(input: { displayName?: string; email: string; phone: string; countryCode?: string }): NormalizedProspectContact {
    const emailNormalized = input.email.trim().toLowerCase();
    if (!emailNormalized.includes("@")) throw new Error("Email is invalid");
    const phoneNormalized = this.normalizePhone(input.phone, input.countryCode);
    return {
      ...(input.displayName ? { displayName: input.displayName.trim() } : {}),
      emailNormalized,
      phoneNormalized,
      emailFingerprint: this.fingerprint(emailNormalized),
      phoneFingerprint: this.fingerprint(phoneNormalized)
    };
  }

  fingerprint(value: string): string {
    return createHash("sha256").update(`assurmatch:${value.trim().toLowerCase()}`).digest("hex");
  }

  private normalizePhone(phone: string, countryCode = "CI"): string {
    const trimmed = phone.replace(/\s+/g, "");
    if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;
    if (countryCode.toUpperCase() === "CI" && /^\d{8,12}$/.test(trimmed)) return `+225${trimmed}`;
    throw new Error("Phone is invalid");
  }
}
