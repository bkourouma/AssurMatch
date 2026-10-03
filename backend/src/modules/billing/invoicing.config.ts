import type { InvoiceIssuer } from "../../../../packages/shared/contracts/billing.contracts";

/**
 * Spec 060 (research R-4): invoicing settings come from the environment only. No legal data is
 * hard-coded: a missing mention is rendered as a visible placeholder and the invoice is flagged
 * `legalMentionsComplete: false`. VAT defaults (CI 18 %, SN 18 %) are configuration values that the
 * accounting team must validate before production.
 */
export const LEGAL_MENTION_PLACEHOLDER = "[A COMPLETER]";

/** Default standard VAT rates in basis points. To be validated by accounting (spec 060 FR-05). */
export const DEFAULT_VAT_RATE_BPS: Readonly<Record<string, number>> = { CI: 1800, SN: 1800 };

/** Tax identifier label printed on the invoice: Cote d'Ivoire NCC, Senegal NINEA. */
const TAX_ID_LABELS: Readonly<Record<string, string>> = { CI: "NCC", SN: "NINEA" };

const ISSUER_FIELDS = {
  legalName: "LEGAL_NAME",
  address: "ADDRESS",
  registrationNumber: "RCCM",
  taxId: "TAX_ID",
  email: "EMAIL",
  paymentInstructions: "PAYMENT_INSTRUCTIONS"
} as const;

export interface CountryInvoicingProfile {
  countryCode: string;
  vatRateBps: number;
  issuer: InvoiceIssuer;
  legalMentionsComplete: boolean;
  missingMentions: string[];
}

export interface InvoicingConfig {
  paymentTermDays: number;
  /** True in production-like environments: issuing with placeholder mentions is refused. */
  requireCompleteLegalMentions: boolean;
  profileFor(countryCode: string): CountryInvoicingProfile | undefined;
}

type Env = Record<string, string | undefined>;

function parseVatRateBps(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const percent = Number(raw.replace(",", "."));
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error(`Invoice VAT rate must be a percentage between 0 and 100, received ${raw}`);
  return Math.round(percent * 100);
}

function value(env: Env, countryCode: string, suffix: string): string | undefined {
  const scoped = env[`ASSURMATCH_INVOICE_${countryCode}_ISSUER_${suffix}`]?.trim();
  if (scoped) return scoped;
  const global = env[`ASSURMATCH_INVOICE_ISSUER_${suffix}`]?.trim();
  return global || undefined;
}

export function resolveInvoicingConfig(env: Env = process.env): InvoicingConfig {
  const appEnv = env.APP_ENV ?? env.NODE_ENV ?? "local";
  const productionLike = appEnv === "production" || appEnv === "preproduction";
  const requireCompleteLegalMentions = env.ASSURMATCH_INVOICE_REQUIRE_LEGAL_MENTIONS
    ? env.ASSURMATCH_INVOICE_REQUIRE_LEGAL_MENTIONS === "true"
    : productionLike;
  const term = Number(env.ASSURMATCH_INVOICE_PAYMENT_TERM_DAYS ?? "30");
  const paymentTermDays = Number.isInteger(term) && term >= 0 && term <= 120 ? term : 30;

  return {
    paymentTermDays,
    requireCompleteLegalMentions,
    profileFor(rawCountryCode: string): CountryInvoicingProfile | undefined {
      const countryCode = rawCountryCode.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(countryCode)) return undefined;
      const vatRateBps = parseVatRateBps(env[`ASSURMATCH_INVOICE_${countryCode}_VAT_RATE`]) ?? DEFAULT_VAT_RATE_BPS[countryCode];
      if (vatRateBps === undefined) return undefined;
      const missingMentions: string[] = [];
      const read = (field: keyof typeof ISSUER_FIELDS, required: boolean): string => {
        const found = value(env, countryCode, ISSUER_FIELDS[field]);
        if (found) return found;
        if (required) missingMentions.push(field);
        return LEGAL_MENTION_PLACEHOLDER;
      };
      const issuer: InvoiceIssuer = {
        legalName: read("legalName", true),
        address: read("address", true),
        registrationNumber: read("registrationNumber", true),
        taxIdLabel: TAX_ID_LABELS[countryCode] ?? "Identifiant fiscal",
        taxId: read("taxId", true),
        email: read("email", false),
        paymentInstructions: read("paymentInstructions", false)
      };
      return { countryCode, vatRateBps, issuer, legalMentionsComplete: missingMentions.length === 0, missingMentions };
    }
  };
}
