import { describe, expect, it, vi } from "vitest";
import { AI_ASSISTANCE_DISCLAIMER, visitorAiRequestSchemas, visitorAssistTypes } from "../../../../../packages/shared/contracts/ai.contracts";
import { AuditLogWriter } from "../../../../src/modules/audit-logs/audit-log-writer.service";
import { AiAuditActions } from "../../../../src/modules/ai/core/ai-audit-actions";
import { AiGateway } from "../../../../src/modules/ai/core/ai-gateway.service";
import { AiGuardrails } from "../../../../src/modules/ai/core/ai-guardrails";
import { AiPromptLibrary } from "../../../../src/modules/ai/core/ai-prompts";
import { TemplateAiProvider, type AiGenerateRequest, type AiProviderPort } from "../../../../src/modules/ai/core/ai-provider.port";
import { PiiMinimizer } from "../../../../src/modules/ai/core/pii-minimizer";
import { offerExplainerData } from "../../../../src/modules/ai/visitor-ai.service";
import { InMemoryQueue } from "../../../../src/modules/common/queues/queues.module";
import { InMemoryRedisClient } from "../../../../src/modules/common/redis/redis.module";
import { FeatureFlagsService } from "../../../../src/modules/feature-flags/feature-flags.module";
import { superAdminActor } from "../../../integration/helpers/enterprise-seed";

const ID_A = "00000000-0000-4000-8000-0000000000a1";
const ID_B = "00000000-0000-4000-8000-0000000000b2";
const ID_C = "00000000-0000-4000-8000-0000000000c3";

const guaranteeInput = {
  countryCode: "CI",
  productKey: "auto",
  currency: "XOF",
  offer: {
    offerName: "Auto Confort",
    insurerName: "Assureur Test",
    guaranteeSummary: "Responsabilite civile et vol.",
    guarantees: [{ label: "Responsabilite civile", included: true }, { label: "Bris de glace", included: false }],
    exclusionsSummary: "Conduite sans permis.",
    deductibleAmount: 50000,
    coverageCeiling: 5000000,
    processingDelayDays: 3,
    indicativePriceMin: 120000,
    indicativePriceMax: 180000
  }
};

const compareInput = {
  countryCode: "CI",
  productKey: "auto",
  currency: "XOF",
  offers: [{ label: "offre 1" }, { label: "offre 2" }, { label: "offre 3" }],
  rows: [
    { key: "price", label: "Prix indicatif (a partir de)", values: [120000, 90000, 150000] },
    { key: "deductible", label: "Franchise", values: [50000, 50000, 50000] },
    { key: "ceiling", label: "Plafond de garantie", values: [5000000, null, 8000000] },
    { key: "processingDelay", label: "Delai moyen de traitement (jours)", values: [3, 2, 2] },
    { key: "guarantee:rc", label: "Garantie: Responsabilite civile", values: [true, true, true] },
    { key: "guarantee:glass", label: "Garantie: Bris de glace", values: [true, false, null] }
  ]
};

function request(assistType: AiGenerateRequest["assistType"], input: Record<string, unknown>, language: "fr" | "en"): AiGenerateRequest {
  return { assistType, system: "", user: "", json: false, maxOutputTokens: 1024, language, input };
}

function spyProvider(text: string): AiProviderPort & { generate: ReturnType<typeof vi.fn> } {
  return { name: "spy", generate: vi.fn(async () => ({ text, model: "spy-model" })) };
}

async function gatewayWith(provider: AiProviderPort, flags: string[]) {
  const audit = new AuditLogWriter();
  const featureFlags = new FeatureFlagsService(audit);
  for (const key of flags) await featureFlags.applyCompliancePolicy({ key, scopeType: "global", value: true, reason: "explainer test" }, superAdminActor, { reference: "TEST-AI-POLICY", approvedBy: "compliance" });
  const gateway = new AiGateway({ audit, featureFlags, provider, fallbackProvider: new TemplateAiProvider(), queue: new InMemoryQueue(), redis: new InMemoryRedisClient(), autoProcess: false });
  return { audit, gateway };
}

const openScope = { countryFlags: { country_ai_enabled: true }, productFlags: { product_ai_form_assistant_enabled: true } };

describe("visitor explainer request schemas", () => {
  it("registers both assist types", () => {
    expect(visitorAssistTypes).toEqual(expect.arrayContaining(["visitor_guarantee_explainer", "visitor_compare_explainer"]));
    expect(Object.keys(visitorAiRequestSchemas)).toEqual(expect.arrayContaining(["visitor_guarantee_explainer", "visitor_compare_explainer"]));
  });

  it("validates the guarantee explainer body", () => {
    const schema = visitorAiRequestSchemas.visitor_guarantee_explainer;
    expect(schema.parse({ countryCode: "CI", productKey: "auto", offerId: ID_A }).language).toBe("fr");
    expect(schema.safeParse({ countryCode: "CI", productKey: "auto", offerId: "not-a-uuid" }).success).toBe(false);
    expect(schema.safeParse({ countryCode: "CI", offerId: ID_A }).success).toBe(false);
  });

  it("validates the compare explainer body: 2 to 4 de-duplicated offers", () => {
    const schema = visitorAiRequestSchemas.visitor_compare_explainer;
    const base = { countryCode: "CI", productKey: "auto", language: "en" as const };
    expect(schema.parse({ ...base, offerIds: [ID_A, ID_B] }).offerIds).toEqual([ID_A, ID_B]);
    expect(schema.parse({ ...base, offerIds: [ID_A, ID_B, ID_A] }).offerIds).toEqual([ID_A, ID_B]);
    expect(schema.safeParse({ ...base, offerIds: [ID_A] }).success).toBe(false);
    expect(schema.safeParse({ ...base, offerIds: [ID_A, ID_A] }).success).toBe(false);
    expect(schema.safeParse({ ...base, offerIds: [ID_A, ID_B, ID_C, "00000000-0000-4000-8000-0000000000d4", "00000000-0000-4000-8000-0000000000e5"] }).success).toBe(false);
  });
});

describe("TemplateAiProvider visitor explainers", () => {
  const provider = new TemplateAiProvider();
  const guardrails = new AiGuardrails();

  it("renders approved French and English guarantee explanations from the input only", async () => {
    const fr = (await provider.generate(request("visitor_guarantee_explainer", guaranteeInput, "fr"))).text;
    const en = (await provider.generate(request("visitor_guarantee_explainer", guaranteeInput, "en"))).text;
    expect(fr).toContain("Auto Confort");
    expect(fr).toContain("Responsabilite civile");
    expect(fr).toContain("Bris de glace");
    expect(fr).toContain("120 000 XOF");
    expect(fr).toContain("a confirmer par le courtier partenaire");
    expect(en).toContain("Guarantees listed as included: Responsabilite civile");
    expect(en).toContain("to be confirmed by the partner broker");
    for (const [type, text] of [["visitor_guarantee_explainer", fr], ["visitor_guarantee_explainer", en]] as const) {
      expect(guardrails.evaluate(type, text)).toEqual({ approved: true, reasons: [] });
    }
  });

  it("renders approved French and English comparisons with factual gaps and no ranking", async () => {
    const fr = (await provider.generate(request("visitor_compare_explainer", compareInput, "fr"))).text;
    const en = (await provider.generate(request("visitor_compare_explainer", compareInput, "en"))).text;
    expect(fr).toContain("le prix indicatif le plus bas est celui de l'offre 2".replace(/^l/, "L"));
    expect(fr).toContain("Franchise: identique");
    expect(fr).toContain("le delai de traitement le plus court".replace(/^l/, "L") + " est partage par les offres 2 et 3");
    expect(fr).toContain('Garantie "Bris de glace": incluse dans l\'offre 1; non incluse dans l\'offre 2; non precisee pour l\'offre 3.');
    expect(en).toContain("The lowest indicative price is that of offer 2");
    expect(en).toContain('Guarantee "Bris de glace": included in offer 1; not included in offer 2; not specified for offer 3.');
    for (const text of [fr, en]) {
      expect(guardrails.evaluate("visitor_compare_explainer", text)).toEqual({ approved: true, reasons: [] });
      expect(text).not.toMatch(/meilleur|best|conseill/i);
    }
  });

  it("answers visitor_form_help in English when asked and keeps the French default", async () => {
    const input = { fieldLabel: "Vehicle use", productKey: "auto" };
    const en = (await provider.generate(request("visitor_form_help", input, "en"))).text;
    const fr = (await provider.generate(request("visitor_form_help", input, "fr"))).text;
    expect(en).toContain("helps the partner broker");
    expect(fr).toContain("sert au courtier partenaire");
    expect(guardrails.evaluate("visitor_form_help", en).approved).toBe(true);
  });
});

describe("visitor guardrails against subscription or choice advice", () => {
  const guardrails = new AiGuardrails();
  const forbidden = [
    "Nous vous conseillons l'offre 2, souscrivez.",
    "Je vous conseille cette offre.",
    "Vous devriez choisir l'offre 1.",
    "Choisissez l'offre 3 sans attendre.",
    "Choisissez cette offre.",
    "Privilégiez la franchise la plus basse.",
    "C'est le meilleur choix.",
    "L'offre la plus adaptée pour vous est la 2.",
    "L'offre la plus avantageuse est la 1.",
    "You should choose offer 1.",
    "You should subscribe to offer 2.",
    "This is the best offer.",
    "It is the best choice for a driver.",
    "We recommend offer 2."
  ];

  it.each(forbidden)("rejects %s for visitor types", (text) => {
    for (const type of ["visitor_guarantee_explainer", "visitor_compare_explainer", "visitor_faq"] as const) {
      expect(guardrails.evaluate(type, text).approved).toBe(false);
    }
  });

  it("leaves non-visitor types and neutral wording untouched", () => {
    expect(guardrails.evaluate("lead_summary", "Nous vous conseillons de rappeler ce prospect.").approved).toBe(true);
    expect(guardrails.evaluate("visitor_compare_explainer", "L'offre la plus basse en prix est l'offre 2; la franchise est identique.").approved).toBe(true);
  });
});

describe("prompts", () => {
  it("embeds the neutrality and non-invention rules in both explainer tasks", () => {
    const prompts = new AiPromptLibrary();
    const guarantee = prompts.build("visitor_guarantee_explainer", guaranteeInput, "fr").user;
    const compare = prompts.build("visitor_compare_explainer", compareInput, "fr").user;
    expect(guarantee).toContain("n'invente aucune garantie");
    expect(guarantee).toContain("a confirmer par le courtier partenaire");
    expect(compare).toContain("Ne classe jamais les offres");
    expect(compare).toContain("laquelle choisir ou souscrire");
  });
});

describe("AiGateway with the explainers", () => {
  it("never calls the provider when the global flag is closed or the scope flags are closed", async () => {
    const closedGlobal = await gatewayWith(spyProvider("x"), ["ai_recommendation_enabled"]);
    const record = await closedGlobal.gateway.run({ assistType: "visitor_guarantee_explainer", surface: "visitor", actor: superAdminActor, input: guaranteeInput, scope: openScope, quotaKey: "ip-1" }, { wait: false });
    expect(record).toMatchObject({ status: "refused", refusalReason: "ai_disabled" });
    expect(closedGlobal.audit.search({ action: AiAuditActions.refused })[0]?.context).toMatchObject({ modelCall: false, reasons: ["ai_summary_enabled_off"] });

    const spy = spyProvider("x");
    const open = await gatewayWith(spy, ["ai_summary_enabled"]);
    for (const scope of [
      { countryFlags: { country_ai_enabled: false }, productFlags: { product_ai_form_assistant_enabled: true } },
      { countryFlags: { country_ai_enabled: true }, productFlags: { product_ai_form_assistant_enabled: false } }
    ]) {
      const refused = await open.gateway.run({ assistType: "visitor_compare_explainer", surface: "visitor", actor: superAdminActor, input: compareInput, scope, quotaKey: "ip-2" }, { wait: false });
      expect(refused).toMatchObject({ status: "refused", refusalReason: "ai_disabled", outputText: null });
    }
    expect(spy.generate).not.toHaveBeenCalled();
    expect(open.audit.search({ action: AiAuditActions.refused }).every((entry) => (entry.context as { modelCall?: boolean }).modelCall === false)).toBe(true);
  });

  it("withholds provider outputs that recommend a choice", async () => {
    for (const text of ["Nous vous conseillons l'offre 2, souscrivez.", "You should choose offer 1."]) {
      const { gateway } = await gatewayWith(spyProvider(text), ["ai_summary_enabled"]);
      const record = await gateway.run({ assistType: "visitor_compare_explainer", surface: "visitor", actor: superAdminActor, input: compareInput, scope: openScope, quotaKey: "ip-3" });
      expect(record.status).toBe("refused");
      expect(record.refusalReason).toContain("guardrail_violation");
      expect(record.outputText).toBeNull();
    }
  });

  it("completes template output with the disclaimer", async () => {
    const { gateway } = await gatewayWith(new TemplateAiProvider(), ["ai_summary_enabled"]);
    const record = await gateway.run({ assistType: "visitor_compare_explainer", surface: "visitor", actor: superAdminActor, input: compareInput, scope: openScope, language: "en", quotaKey: "ip-4" });
    expect(record.status).toBe("completed");
    expect(record.outputText).toContain(AI_ASSISTANCE_DISCLAIMER);
    expect(record.outputText).toContain("offer 2");
  });
});

describe("offer data sent to the gateway", () => {
  it("keeps the offer name (not minimised away) and scrubs contact data hidden in descriptions", () => {
    const data = offerExplainerData({
      id: ID_A,
      name: "Auto Confort",
      indicativePriceLabel: "prix a confirmer",
      guarantees: [{ key: "rc", label: "Responsabilite civile", included: true }],
      isSponsored: false,
      disclaimer: "x",
      validUntil: "2030-01-01T00:00:00.000Z",
      publicDisclaimers: ["x"],
      requiredDocuments: [],
      shortDescription: "Appelez ama@example.test ou le +225 01 02 03 04 05"
    } as Parameters<typeof offerExplainerData>[0]);
    expect(JSON.stringify(data)).not.toContain(ID_A);
    const { minimized } = new PiiMinimizer().minimize(data) as { minimized: Record<string, unknown> };
    expect(minimized.offerName).toBe("Auto Confort");
    expect(JSON.stringify(minimized)).not.toContain("example.test");
    expect(JSON.stringify(minimized)).not.toContain("01 02 03");
  });
});
