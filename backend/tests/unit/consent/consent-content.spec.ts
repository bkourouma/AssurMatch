import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  consentContentHash,
  findConsentContentIssues,
  normalizeConsentContent,
  resolveConsentContent
} from "../../../../packages/shared/contracts/consent-content";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { ConsentService, loadConsentTemplates, MemoryConsentRecordsRepository } from "../../../src/modules/consent/consent.module";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

const COUNTRY_ID = "00000000-0000-4000-8000-000000000030";
const VALID = "Transmission de vos coordonnees ({{contactFields}}) a {{brokerName}} pour {{countryName}} / {{productName}}. AssurMatch est une plateforme technique.";

describe("consent content (spec 050 R5)", () => {
  it("hashes the normalised template: LF line endings, no edge whitespace", () => {
    const expected = createHash("sha256").update("ligne 1\nligne 2", "utf8").digest("hex");
    expect(normalizeConsentContent("  ligne 1\r\nligne 2 \n")).toBe("ligne 1\nligne 2");
    expect(consentContentHash("  ligne 1\r\nligne 2 \n")).toBe(expected);
    expect(consentContentHash("ligne 1\nligne 2")).toBe(expected);
    expect(consentContentHash("ligne 1\nligne 3")).not.toBe(expected);
  });

  it("resolves the four variables, with a localised default broker wording", () => {
    const fr = resolveConsentContent(VALID, "fr", { countryName: "Senegal", productName: "Voyage", contactFields: ["nom", "e-mail"] });
    expect(fr).toBe("Transmission de vos coordonnees (nom, e-mail) a le courtier partenaire agréé auquel votre demande sera attribuée pour Senegal / Voyage. AssurMatch est une plateforme technique.");
    const en = resolveConsentContent(VALID, "en", { brokerName: "Broker SA" });
    expect(en).toContain("a Broker SA pour");
    expect(resolveConsentContent("{{brokerName}}", "en")).toBe("the licensed partner broker your request will be assigned to");
    expect(resolveConsentContent("{{unknown}} {{ countryName }}", "fr", { countryName: "CI" })).toBe("{{unknown}} CI");
  });

  it("lists every publication issue", () => {
    expect(findConsentContentIssues({ purpose: "lead_transmission", content: VALID, contentHash: consentContentHash(VALID) })).toEqual([]);
    expect(findConsentContentIssues({ purpose: "lead_transmission", content: "  " }).map((issue) => issue.code)).toEqual(["content_missing"]);
    expect(findConsentContentIssues({ purpose: "lead_transmission", content: VALID, contentHash: "other" }).map((issue) => issue.code)).toEqual(["content_hash_mismatch"]);
    expect(findConsentContentIssues({ purpose: "lead_transmission", content: "Souscrire maintenant via un courtier." }).map((issue) => issue.code))
      .toEqual(["forbidden_wording", "recipient_variable_missing", "technical_role_missing"]);
    // Only lead_transmission names a recipient; other purposes only need clean wording.
    expect(findConsentContentIssues({ purpose: "marketing_optional", content: "Recevoir nos actualites." })).toEqual([]);
  });

  it("ships compliant reference templates", () => {
    const templates = loadConsentTemplates();
    expect(templates.map((template) => template.templateKey).sort()).toEqual(["lead-transmission-en", "lead-transmission-fr"]);
    for (const template of templates) {
      expect(findConsentContentIssues({ purpose: template.purpose, content: template.bodyTemplate })).toEqual([]);
    }
  });

  it("computes the hash in the service, ignores the caller's and refuses to publish an inconsistent text", async () => {
    const repository = new MemoryConsentRecordsRepository();
    const service = new ConsentService(new AuditLogWriter(), repository);
    const text = await service.createText({
      purpose: "lead_transmission", countryId: COUNTRY_ID, channel: "public_web", recipientCategory: "courtier_partenaire_agree",
      language: "fr", version: "v1", contentHash: "forged", content: `\r\n${VALID}\r\n`
    }, superAdminActor);
    expect(text.content).toBe(VALID);
    expect(text.contentHash).toBe(consentContentHash(VALID));
    expect(service.resolveContent(text, { countryName: "CI" })).toContain("pour CI /");

    // Tampering with the stored hash after creation is caught at publication.
    const tampered = await service.createText({
      purpose: "lead_transmission", countryId: COUNTRY_ID, channel: "public_web", recipientCategory: "courtier_partenaire_agree",
      language: "en", version: "v1", contentHash: "x", content: VALID
    }, superAdminActor);
    await repository.updateText(tampered.id, { contentHash: "tampered" });
    await expect(service.publishText(tampered.id, superAdminActor)).rejects.toMatchObject({ response: { code: "CONSENT_TEXT_INVALID" } });

    await expect(service.publishText(text.id, superAdminActor)).resolves.toMatchObject({ status: "published" });
    await expect(service.retireText(text.id, superAdminActor, "retrait")).resolves.toMatchObject({ status: "retired" });
    await expect(service.publishText(text.id, superAdminActor)).rejects.toThrow("conflict");
  });
});
