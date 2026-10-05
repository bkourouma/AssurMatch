import { createHash } from "node:crypto";
import { findForbiddenWording } from "./content-safety";

/**
 * Spec 050 R5: consent text content helpers shared by the API and the seed scripts.
 *
 * Server-only (it imports `node:crypto`): it is deliberately not re-exported from the contracts
 * index, so the public and back-office web bundles never pull it in.
 */

/** Line endings normalised to LF and edge whitespace removed: the exact bytes the hash covers. */
export function normalizeConsentContent(content: string): string {
  return content.replace(/\r\n?/g, "\n").trim();
}

/** sha256 (hex) of the normalised template. Variables stay unresolved: the template is what is versioned. */
export function consentContentHash(content: string): string {
  return createHash("sha256").update(normalizeConsentContent(content), "utf8").digest("hex");
}

/**
 * Localised wording for `{{brokerName}}` while the broker is not known at consent time. Specs 052
 * (chosen offer) and 054 (named broker) will refine the resolution.
 */
export const DEFAULT_CONSENT_BROKER_NAME: Readonly<Record<string, string>> = {
  fr: "le courtier partenaire agréé auquel votre demande sera attribuée",
  en: "the licensed partner broker your request will be assigned to"
};

export function defaultConsentBrokerName(language: string): string {
  return DEFAULT_CONSENT_BROKER_NAME[language] ?? DEFAULT_CONSENT_BROKER_NAME.fr ?? "";
}

export interface ConsentContentVariables {
  brokerName?: string;
  countryName?: string;
  productName?: string;
  /** Labels of the contact data collected, already in the form language. */
  contactFields?: string[] | string;
}

/** Replaces the four supported placeholders; an unknown `{{...}}` is left untouched. */
export function resolveConsentContent(content: string, language: string, variables: ConsentContentVariables = {}): string {
  const contactFields = Array.isArray(variables.contactFields) ? variables.contactFields.join(", ") : variables.contactFields ?? "";
  const values: Record<string, string> = {
    brokerName: variables.brokerName ?? defaultConsentBrokerName(language),
    countryName: variables.countryName ?? "",
    productName: variables.productName ?? "",
    contactFields
  };
  return normalizeConsentContent(content).replace(/\{\{\s*(brokerName|countryName|productName|contactFields)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
}

export type ConsentContentIssueCode =
  | "content_missing"
  | "content_hash_mismatch"
  | "forbidden_wording"
  | "recipient_variable_missing"
  | "technical_role_missing";

export interface ConsentContentIssue {
  code: ConsentContentIssueCode;
  detail?: string;
}

/**
 * FR-012 publication rules. `lead_transmission` must name its recipient (`{{brokerName}}`) and
 * recall the technical role of AssurMatch; no purpose may carry forbidden regulated wording.
 */
export function findConsentContentIssues(input: { purpose: string; content?: string | null; contentHash?: string }): ConsentContentIssue[] {
  const content = input.content ? normalizeConsentContent(input.content) : "";
  if (!content) return [{ code: "content_missing" }];
  const issues: ConsentContentIssue[] = [];
  if (input.contentHash !== undefined && input.contentHash !== consentContentHash(content)) {
    issues.push({ code: "content_hash_mismatch" });
  }
  for (const wording of findForbiddenWording(content)) issues.push({ code: "forbidden_wording", detail: wording });
  if (input.purpose === "lead_transmission") {
    if (!/\{\{\s*brokerName\s*\}\}/.test(content)) issues.push({ code: "recipient_variable_missing", detail: "{{brokerName}}" });
    if (!/assurmatch/i.test(content)) issues.push({ code: "technical_role_missing", detail: "AssurMatch" });
  }
  return issues;
}
