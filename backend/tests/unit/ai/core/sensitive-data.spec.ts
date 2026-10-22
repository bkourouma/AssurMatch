import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../../src/modules/audit-logs/audit-log-writer.service";
import { AiAuditActions } from "../../../../src/modules/ai/core/ai-audit-actions";
import { AiGateway } from "../../../../src/modules/ai/core/ai-gateway.service";
import { TemplateAiProvider, type AiProviderPort } from "../../../../src/modules/ai/core/ai-provider.port";
import { PiiMinimizer } from "../../../../src/modules/ai/core/pii-minimizer";
import { SensitiveDataDetector, ibanValid, luhnValid } from "../../../../src/modules/ai/core/sensitive-data-detector";
import { InMemoryQueue } from "../../../../src/modules/common/queues/queues.module";
import { InMemoryRedisClient } from "../../../../src/modules/common/redis/redis.module";
import { FeatureFlagsService } from "../../../../src/modules/feature-flags/feature-flags.module";
import { superAdminActor } from "../../../integration/helpers/enterprise-seed";

const detector = new SensitiveDataDetector();

const POSITIVES: Array<[string, string, string]> = [
  ["health", "Le client est diabétique et sous traitement depuis 2019", "health"],
  ["health", "Diagnosed with cancer last year", "health"],
  ["health", "Atteint de drépanocytose", "health"],
  ["card", "Carte 4111 1111 1111 1111 expire 12/28", "card"],
  ["card", "pan=5500005555555559", "card"],
  ["iban", "IBAN FR14 2004 1010 0505 0001 3M02 606 merci", "iban"],
  ["iban", "GB82WEST12345698765432", "iban"],
  ["secret", "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.abcDEF123_-xyz", "secret"],
  ["secret", "Authorization: Bearer abcdefghijklmnop1234567890", "secret"],
  ["secret", "cle sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV", "secret"],
  ["secret", "AKIAIOSFODNN7EXAMPLE", "secret"],
  ["secret", "mot de passe : Tr0ub4dor&3", "secret"],
  ["secret", "password=hunter2", "secret"],
  ["secret", "mdp: azerty123", "secret"],
  ["plate", "vehicule AB-123-CD en panne", "plate"],
  ["plate", "plaque d'immatriculation : 1234 AB 01", "plate"],
  ["birth_date", "Né le 12/03/1985 a Abidjan", "birth_date"],
  ["birth_date", "date de naissance: 3 mars 1990", "birth_date"],
  ["national_id", "CNI n° CI0012345678", "national_id"],
  ["national_id", "SSN 123-45-6789", "national_id"],
  ["passport", "passeport N° 12AB34567", "passport"],
  ["driving_license", "permis de conduire n° 04/123456", "driving_license"]
];

describe("SensitiveDataDetector", () => {
  it.each(POSITIVES)("detects %s in %j and redacts the value", (_label, text, category) => {
    const detection = detector.detect(text);
    expect(detection.categories).toContain(category);
    const redacted = detector.redact(text);
    expect(redacted).toContain(`[${category}]`);
    expect(detector.detect(redacted).categories).toEqual([]);
  });

  it("never leaves the sensitive value in the redacted text", () => {
    const text = "Carte 4111 1111 1111 1111, mdp: azerty123, IBAN GB82WEST12345698765432, diabete, Bearer abcdefghijklmnop1234567890";
    const redacted = detector.redact(text);
    for (const value of ["4111", "azerty123", "GB82", "diabete", "abcdefghijklmnop"]) expect(redacted).not.toContain(value);
  });

  it("keeps amounts, years, dates without birth context and ordinary words", () => {
    const harmless = [
      "Prime annuelle de 1 250 000 FCFA, franchise 50000, plafond 15000000",
      "Montant 1250000000000 FCFA",
      "Vehicule de 2018, assure depuis 2021",
      "Echeance le 12/03/2027, effet 2026-10-22",
      "Assurance sante famille avec garantie hospitalisation et consultation",
      "Permis de conduire valide, passeport en cours de renouvellement",
      "Carte grise a jour, plaque visible",
      "Telephone [phone], email [email], reference AM-2026-0001",
      "Annee de naissance 1985"
    ];
    for (const text of harmless) expect(detector.detect(text).categories, text).toEqual([]);
  });

  it("validates cards with Luhn and IBAN with mod 97", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
    expect(ibanValid("GB82 WEST 1234 5698 7654 32")).toBe(true);
    expect(ibanValid("GB82WEST12345698765433")).toBe(false);
    expect(detector.detect("carte 4111 1111 1111 1112").categories).not.toContain("card");
    expect(detector.detect("IBAN GB82WEST12345698765433").categories).not.toContain("iban");
  });

  it("scans 800 characters instantly, including pathological input", () => {
    const text = `${"1 ".repeat(200)}${"A1B2".repeat(100)}`.slice(0, 800);
    const started = performance.now();
    detector.detect(text);
    detector.detect("a".repeat(800));
    detector.detect("4".repeat(800));
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe("PiiMinimizer sensitive data", () => {
  it("masks sensitive categories and reports counters without values", () => {
    const { minimized, report } = new PiiMinimizer().minimize({
      need: "Je suis diabétique, carte 4111 1111 1111 1111",
      notes: ["mdp: azerty123"],
      card: 4111111111111111,
      answers: { vehicle_use: "prive" }
    });
    const serialized = JSON.stringify(minimized);
    expect(serialized).not.toMatch(/4111|azerty123|diab/i);
    expect(report.sensitiveCategories).toEqual({ health: 1, card: 2, secret: 1 });
    expect(JSON.stringify(report)).not.toMatch(/4111|azerty123|diab/i);
    expect(report.droppedKeys).toEqual([]);
  });

  it("omits sensitiveCategories when nothing sensitive was found", () => {
    const { report } = new PiiMinimizer().minimize({ need: "assurance auto", amount: 120000 });
    expect(report.sensitiveCategories).toBeUndefined();
  });
});

function countingProvider(): AiProviderPort & { calls: number } {
  return {
    name: "stub",
    calls: 0,
    async generate() {
      this.calls += 1;
      return { text: "Selon les informations fournies, ce produit pourrait correspondre.", model: "stub-model", inputTokens: 1, outputTokens: 1 };
    }
  };
}

async function gatewayWith(provider: AiProviderPort) {
  const audit = new AuditLogWriter();
  const featureFlags = new FeatureFlagsService(audit);
  for (const key of ["ai_summary_enabled", "ai_recommendation_enabled", "ai_broker_assistant_enabled", "ai_lead_scoring_enabled", "ai_duplicate_detection_enabled"]) {
    await featureFlags.applyCompliancePolicy({ key, scopeType: "global", value: true, reason: "sensitive data test" }, superAdminActor, { reference: "TEST-AI-POLICY", approvedBy: "compliance" });
  }
  const gateway = new AiGateway({ audit, featureFlags, provider, fallbackProvider: new TemplateAiProvider(), queue: new InMemoryQueue(), redis: new InMemoryRedisClient(), autoProcess: false });
  return { audit, gateway };
}

describe("AiGateway sensitive data guard", () => {
  it("masks sensitive input before the provider and never stores or audits the value", async () => {
    const provider = countingProvider();
    const { audit, gateway } = await gatewayWith(provider);
    const record = await gateway.run({ assistType: "visitor_request_summary", surface: "visitor", actor: superAdminActor, input: { need: "diabétique, carte 4111 1111 1111 1111" }, scope: {}, quotaKey: "ip-s1" });
    expect(record.status).toBe("completed");
    expect(provider.calls).toBe(1);
    expect(JSON.stringify(record)).not.toMatch(/4111|diab/i);
    expect(record.minimizationReport).toMatchObject({ sensitiveCategories: { health: 1, card: 1 } });
    expect(JSON.stringify(audit.search({}))).not.toMatch(/4111|diab/i);
  });

  it("refuses without provider call when the final prompt still holds sensitive data", async () => {
    const provider = countingProvider();
    const { audit, gateway } = await gatewayWith(provider);
    const original = (gateway as unknown as { prompts: { build: (...args: unknown[]) => { user: string } } }).prompts;
    const build = original.build.bind(original);
    original.build = (...args: unknown[]) => {
      const bundle = build(...args);
      return { ...bundle, user: `${bundle.user}\nsecret interne: Bearer abcdefghijklmnop1234567890` };
    };
    const record = await gateway.run({ assistType: "visitor_faq", surface: "visitor", actor: superAdminActor, input: { question: "Quelle assurance ?" }, scope: {}, quotaKey: "ip-s2" });
    expect(record.status).toBe("refused");
    expect(record.refusalReason).toBe("sensitive_data_in_prompt");
    expect(record.outputText).toBeNull();
    expect(provider.calls).toBe(0);
    const refused = audit.search({ action: AiAuditActions.refused }).at(-1);
    expect(refused?.context).toMatchObject({ modelCall: false, reasons: ["sensitive_data_in_prompt"], sensitiveCategories: [{ category: "secret", count: 1 }] });
    expect(JSON.stringify(audit.search({}))).not.toContain("abcdefghijklmnop");
    expect(JSON.stringify(record)).not.toContain("abcdefghijklmnop");
  });

  it("does not apply the guard to the deterministic template provider", async () => {
    const { gateway } = await gatewayWith(new TemplateAiProvider());
    const original = (gateway as unknown as { prompts: { build: (...args: unknown[]) => { user: string } } }).prompts;
    const build = original.build.bind(original);
    original.build = (...args: unknown[]) => ({ ...build(...args), user: "Bearer abcdefghijklmnop1234567890" });
    const record = await gateway.run({ assistType: "visitor_faq", surface: "visitor", actor: superAdminActor, input: { question: "Quelle assurance ?" }, scope: {}, quotaKey: "ip-s3" });
    expect(record.refusalReason).not.toBe("sensitive_data_in_prompt");
  });
});

describe("AiGateway broker product flag (spec 075 FR-D1)", () => {
  const brokerTypes = ["lead_summary", "next_action", "relaunch_message", "loss_analysis", "duplicate_hint"] as const;

  it.each(brokerTypes)("%s requires product_ai_scoring_enabled when the product scope is known", async (assistType) => {
    const { gateway } = await gatewayWith(countingProvider());
    expect(gateway.isEnabled(assistType, { plan: "enterprise", productFlags: { product_ai_scoring_enabled: false } }).reasons).toContain("product_ai_broker_assistant_disabled");
    expect(gateway.isEnabled(assistType, { plan: "enterprise", productFlags: {} }).reasons).toContain("product_ai_broker_assistant_disabled");
    expect(gateway.isEnabled(assistType, { plan: "enterprise", productFlags: { product_ai_scoring_enabled: true } }).enabled).toBe(true);
    expect(gateway.isEnabled(assistType, { plan: "enterprise" }).enabled).toBe(true);
  });

  it("refuses without provider call when the product flag is closed, and runs when open", async () => {
    const provider = countingProvider();
    const { audit, gateway } = await gatewayWith(provider);
    const base = { assistType: "lead_summary", surface: "broker_crm", actor: superAdminActor, input: { productKey: "auto" }, quotaKey: "tenant-p" } as const;
    const closed = await gateway.run({ ...base, scope: { plan: "pro", productFlags: { product_ai_scoring_enabled: false } } });
    expect(closed.status).toBe("refused");
    expect(provider.calls).toBe(0);
    expect(audit.search({ action: AiAuditActions.refused })[0]?.context).toMatchObject({ modelCall: false, reasons: ["product_ai_broker_assistant_disabled"] });
    const open = await gateway.run({ ...base, scope: { plan: "pro", productFlags: { product_ai_scoring_enabled: true } } });
    expect(open.status).toBe("completed");
    expect(provider.calls).toBe(1);
  });

  it("leaves non-broker assistants untouched by the broker product flag", async () => {
    const { gateway } = await gatewayWith(countingProvider());
    expect(gateway.isEnabled("visitor_faq", { productFlags: { product_ai_form_assistant_enabled: true, product_ai_scoring_enabled: false } }).enabled).toBe(true);
  });
});
