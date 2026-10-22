import { BadRequestException } from "@nestjs/common";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
// Lot 8 (spec 075): one definition of the legacy fingerprint, and the blind index of the erasure lookup.
import { legacyPiiFingerprint, PiiVault } from "../common/security/pii-vault";

export interface NormalizedProspectContact {
  displayName?: string;
  emailNormalized: string;
  phoneNormalized: string;
  emailFingerprint: string;
  phoneFingerprint: string;
}

/** Spec 050 R8: a country's dialling code and accepted national number lengths. */
export interface CountryPhoneRule {
  dialCode: string;
  nationalLengths: number[];
}

export class ProspectIdentityService {
  // Lot 8: injectable vault, resolved from the environment on first use (never a module singleton).
  constructor(private vault?: PiiVault) {}

  normalize(input: { displayName?: string; email: string; phone: string; countryCode?: string; phoneRule?: CountryPhoneRule }): NormalizedProspectContact {
    const emailNormalized = input.email.trim().toLowerCase();
    if (!emailNormalized.includes("@")) throw new Error("Email is invalid");
    const phoneNormalized = input.phoneRule && input.phoneRule.nationalLengths.length > 0
      ? this.normalizeCountryPhone(input.phone, input.phoneRule)
      : this.normalizePhone(input.phone, input.countryCode);
    return {
      ...(input.displayName ? { displayName: input.displayName.trim() } : {}),
      emailNormalized,
      phoneNormalized,
      emailFingerprint: this.fingerprint(emailNormalized),
      phoneFingerprint: this.fingerprint(phoneNormalized)
    };
  }

  fingerprint(value: string): string {
    return legacyPiiFingerprint(value);
  }

  /** Lot 8 (spec 075 FR-A2): keyed blind index of an e-mail; undefined without PII_BLIND_INDEX_KEY. */
  emailBlindIndex(value: string): string | undefined {
    this.vault ??= PiiVault.fromEnv();
    return this.vault.blindIndex("email", value);
  }

  /**
   * Spec 050 R8: `+<dial><n digits>` or the national `<n digits>`, n being one of the country's
   * lengths, normalised to `+<dial><national>`. Spaces, dots and dashes are ignored. Anything else
   * is refused ("invalid" maps to 400 in the error filter).
   */
  normalizeCountryPhone(phone: string, rule: CountryPhoneRule): string {
    const compact = phone.replace(/[\s.-]/g, "");
    const dialDigits = rule.dialCode.replace(/^\+/, "");
    let national: string | undefined;
    if (compact.startsWith("+")) {
      if (compact.startsWith(`+${dialDigits}`)) national = compact.slice(dialDigits.length + 1);
    } else {
      national = compact;
    }
    if (national === undefined || !/^\d+$/.test(national) || !rule.nationalLengths.includes(national.length)) {
      // Explicit code: the filter's wording patterns would read "country" as COUNTRY_DISABLED.
      throw new BadRequestException({ code: ErrorCodes.VALIDATION_FAILED, message: "Phone is invalid for country" });
    }
    return `+${dialDigits}${national}`;
  }

  private normalizePhone(phone: string, countryCode = "CI"): string {
    const trimmed = phone.replace(/\s+/g, "");
    if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;
    if (countryCode.toUpperCase() === "CI" && /^\d{8,12}$/.test(trimmed)) return `+225${trimmed}`;
    throw new Error("Phone is invalid");
  }
}
