import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const allowedEmail = z.string().email().refine((email) =>
  email.endsWith(".example") || email.endsWith(".test") || email.endsWith("@assurmatch.local"),
  "email must use a fake .example/.test domain or assurmatch.local"
);

const partnerSchema = z.object({
  legalName: z.string().min(3),
  tradeName: z.string().min(1).optional(),
  registrationNumber: z.string().min(3),
  plan: z.enum(["starter", "pro", "enterprise"]).default("starter"),
  status: z.enum(["draft", "pending_compliance", "active", "suspended", "retired"]).default("pending_compliance"),
  primaryEmail: allowedEmail,
  primaryWhatsApp: z.string().regex(/^\+2250{6,12}$/),
  quotaMonthlyLeads: z.number().int().min(0).default(0),
  capacityStatus: z.enum(["available", "limited", "full", "blocked"]).default("available")
});

const partnerUserSchema = z.object({
  partnerRegistrationNumber: z.string().min(3),
  email: allowedEmail,
  displayName: z.string().min(2),
  role: z.enum(["broker_owner_starter", "broker_owner_pro", "broker_manager", "broker_agent", "broker_readonly"])
});

const licenseSchema = z.object({
  partnerRegistrationNumber: z.string().min(3),
  licenseNumber: z.string().min(3),
  issuingAuthority: z.string().min(3),
  countryIsoCode: z.string().length(2),
  productKeys: z.array(z.string().min(2)).default([]),
  status: z.enum(["draft", "pending_review", "valid", "expired", "suspended", "invalid", "revoked"]),
  effectiveDate: dateOnly,
  expirationDate: dateOnly
}).refine((license) => license.expirationDate > license.effectiveDate, "expirationDate must be after effectiveDate");

const coverageSchema = z.object({
  partnerRegistrationNumber: z.string().min(3),
  countryIsoCode: z.string().length(2),
  productKeys: z.array(z.string().min(2)).default([]),
  status: z.enum(["pending", "active", "suspended"]).default("active")
});

const offerSchema = z.object({
  countryIsoCode: z.string().length(2),
  productKey: z.string().min(2),
  partnerRegistrationNumber: z.string().min(3).optional(),
  publicKey: z.string().min(3),
  name: z.string().min(3),
  shortDescription: z.string().min(3).optional(),
  guaranteeSummary: z.string().min(3).optional(),
  indicativePriceMin: z.number().nonnegative().optional(),
  indicativePriceMax: z.number().nonnegative().optional(),
  currency: z.string().length(3),
  pricingUnit: z.string().min(1).optional(),
  status: z.enum(["draft", "review", "validated", "active", "suspended", "expired", "retired"]).default("draft"),
  validationStatus: z.enum(["pending", "validated", "rejected"]).default("pending"),
  validFrom: dateOnly,
  validUntil: dateOnly,
  isSponsored: z.boolean().default(false),
  sponsorLabel: z.string().min(1).optional(),
  displayPriority: z.number().int().default(0),
  publicDisclaimers: z.array(z.string().min(3)).min(1)
}).refine((offer) => offer.validUntil > offer.validFrom, "validUntil must be after validFrom");

const routingRuleSchema = z.object({
  key: z.string().min(3),
  reason: z.string().min(3)
});

export const partnerImportPayloadSchema = z.object({
  version: z.literal(1),
  metadata: z.object({
    batchId: z.string().min(3),
    fakeData: z.literal(true),
    source: z.string().min(3)
  }),
  partners: z.array(partnerSchema).default([]),
  partnerUsers: z.array(partnerUserSchema).default([]),
  licenses: z.array(licenseSchema).default([]),
  coverage: z.array(coverageSchema).default([]),
  offers: z.array(offerSchema).default([]),
  routingRules: z.array(routingRuleSchema).default([])
});

export type PartnerImportPayload = z.infer<typeof partnerImportPayloadSchema>;
export type PartnerInput = z.infer<typeof partnerSchema>;
export type PartnerUserInput = z.infer<typeof partnerUserSchema>;
export type LicenseInput = z.infer<typeof licenseSchema>;
export type CoverageInput = z.infer<typeof coverageSchema>;
export type OfferInput = z.infer<typeof offerSchema>;

export interface ImportReport {
  dryRun: boolean;
  checksum: string;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ path: string; message: string }>;
}

export type StoreOutcome = "created" | "updated" | "skipped";

export interface ImportStore {
  upsertPartner(input: PartnerInput): Promise<{ outcome: StoreOutcome; id: string }>;
  upsertPartnerUser(input: PartnerUserInput): Promise<{ outcome: StoreOutcome; id: string }>;
  upsertLicense(input: LicenseInput): Promise<{ outcome: StoreOutcome; id: string }>;
  upsertCoverage(input: CoverageInput): Promise<{ outcome: StoreOutcome; id: string }>;
  upsertOffer(input: OfferInput): Promise<{ outcome: StoreOutcome; id: string }>;
  createAudit(input: ImportAuditInput): Promise<void>;
}

export interface ImportAuditInput {
  action: "partner_import.attempted" | "partner_import.completed";
  actorId: string;
  batchId: string;
  checksum: string;
  result: "success" | "failed" | "refused";
  report?: ImportReport;
}

export interface RunImportOptions {
  rawInput: string;
  expectedChecksum: string;
  apply: boolean;
  actorId?: string;
  store?: ImportStore;
}

export function computeSha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function verifySha256(input: string | Buffer, expectedChecksum: string): string {
  const actual = computeSha256(input);
  if (actual.toLowerCase() !== expectedChecksum.toLowerCase()) {
    throw new Error(`SHA256 checksum mismatch: expected ${expectedChecksum}, got ${actual}`);
  }
  return actual;
}

export function parsePartnerImportPayload(rawInput: string): PartnerImportPayload {
  const parsedJson = JSON.parse(rawInput) as unknown;
  const payload = partnerImportPayloadSchema.parse(parsedJson);
  assertNoSecretLikeValues(payload);
  return payload;
}

export async function runPartnerImport(options: RunImportOptions): Promise<ImportReport> {
  const checksum = verifySha256(options.rawInput, options.expectedChecksum);
  const payload = parsePartnerImportPayload(options.rawInput);
  const report: ImportReport = { dryRun: !options.apply, checksum, created: 0, updated: 0, skipped: 0, errors: [] };

  if (!options.apply) {
    report.skipped = countLogicalRecords(payload);
    return report;
  }
  if (!options.store) throw new Error("Apply mode requires an import store");

  const actorId = options.actorId ?? "partner-import-operator";
  await options.store.createAudit({
    action: "partner_import.attempted",
    actorId,
    batchId: payload.metadata.batchId,
    checksum,
    result: "success"
  });

  try {
    for (const partner of payload.partners) applyOutcome(report, await options.store.upsertPartner(partner));
    for (const user of payload.partnerUsers) applyOutcome(report, await options.store.upsertPartnerUser(user));
    for (const license of payload.licenses) applyOutcome(report, await options.store.upsertLicense(license));
    for (const coverage of payload.coverage) applyOutcome(report, await options.store.upsertCoverage(coverage));
    for (const offer of payload.offers) applyOutcome(report, await options.store.upsertOffer(offer));
    report.skipped += payload.routingRules.length;
    await options.store.createAudit({
      action: "partner_import.completed",
      actorId,
      batchId: payload.metadata.batchId,
      checksum,
      result: "success",
      report
    });
    return report;
  } catch (error) {
    report.errors.push({ path: "apply", message: error instanceof Error ? error.message : String(error) });
    await options.store.createAudit({
      action: "partner_import.completed",
      actorId,
      batchId: payload.metadata.batchId,
      checksum,
      result: "failed",
      report
    });
    return report;
  }
}

export class MemoryPartnerImportStore implements ImportStore {
  readonly audits: ImportAuditInput[] = [];
  private readonly partners = new Map<string, string>();
  private readonly users = new Map<string, string>();
  private readonly licenses = new Map<string, string>();
  private readonly coverage = new Map<string, string>();
  private readonly offers = new Map<string, string>();

  async upsertPartner(input: PartnerInput): Promise<{ outcome: StoreOutcome; id: string }> {
    return this.upsert(this.partners, input.registrationNumber);
  }

  async upsertPartnerUser(input: PartnerUserInput): Promise<{ outcome: StoreOutcome; id: string }> {
    return this.upsert(this.users, input.email.toLowerCase());
  }

  async upsertLicense(input: LicenseInput): Promise<{ outcome: StoreOutcome; id: string }> {
    return this.upsert(this.licenses, `${input.partnerRegistrationNumber}:${input.countryIsoCode}:${input.licenseNumber}`);
  }

  async upsertCoverage(input: CoverageInput): Promise<{ outcome: StoreOutcome; id: string }> {
    return this.upsert(this.coverage, `${input.partnerRegistrationNumber}:${input.countryIsoCode}:${input.productKeys.toSorted().join(",")}`);
  }

  async upsertOffer(input: OfferInput): Promise<{ outcome: StoreOutcome; id: string }> {
    return this.upsert(this.offers, `${input.countryIsoCode}:${input.productKey}:${input.publicKey}`);
  }

  async createAudit(input: ImportAuditInput): Promise<void> {
    this.audits.push(input);
  }

  private upsert(map: Map<string, string>, key: string): { outcome: StoreOutcome; id: string } {
    const existing = map.get(key);
    if (existing) return { outcome: "updated", id: existing };
    const id = randomUUID();
    map.set(key, id);
    return { outcome: "created", id };
  }
}

function applyOutcome(report: ImportReport, result: { outcome: StoreOutcome }): void {
  if (result.outcome === "created") report.created += 1;
  else if (result.outcome === "updated") report.updated += 1;
  else report.skipped += 1;
}

function countLogicalRecords(payload: PartnerImportPayload): number {
  return payload.partners.length +
    payload.partnerUsers.length +
    payload.licenses.length +
    payload.coverage.length +
    payload.offers.length +
    payload.routingRules.length;
}

function assertNoSecretLikeValues(payload: PartnerImportPayload): void {
  const textValues = collectStrings(payload);
  const secretPatterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bAIza[0-9A-Za-z_-]{35}\b/,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
    /\bxox[baprs]-[0-9A-Za-z-]+\b/,
    /\bhttps?:\/\/[^\s"]*(prod|production|preprod|staging|live)[^\s"]*/i
  ];
  for (const value of textValues) {
    for (const pattern of secretPatterns) {
      if (pattern.test(value)) throw new Error("Import payload contains secret-like or production-like data");
    }
  }
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => collectStrings(entry));
  if (value && typeof value === "object") return Object.values(value).flatMap((entry) => collectStrings(entry));
  return [];
}
