import { afterEach, describe, expect, it } from "vitest";
import {
  createRuntimeHttpHarness,
  seedBrokerOnboarding,
  seedPublicRuntime,
  type RuntimeHttpHarness
} from "../runtime-http-test-utils";

const CONTACT_EMAIL = "awa.kone@courtier.example";
const CONTACT_PHONE = "+2250102030407";
const LEGAL_NAME = "Courtier Candidat SARL";

function application(overrides: Record<string, unknown> = {}) {
  return {
    legalName: LEGAL_NAME,
    tradeName: "Candidat Demo",
    countryCode: "CI",
    licenseNumber: "LIC-CANDIDAT-001",
    licenseExpiresAt: "2030-01-01",
    licenseIssuingAuthority: "Autorite CIMA",
    productKeys: ["auto"],
    monthlyCapacity: 40,
    contactName: "Awa Kone",
    contactEmail: CONTACT_EMAIL,
    contactPhone: CONTACT_PHONE,
    desiredPlan: "starter",
    message: "Nous souhaitons rejoindre AssurMatch.",
    consent: true,
    ...overrides
  };
}

function post(harness: RuntimeHttpHarness, body: unknown, ipAddress: string): Promise<Response> {
  return harness.request("/partners/applications", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ipAddress },
    body: JSON.stringify(body)
  });
}

describe("public partner applications runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("records an application and never echoes the applicant's personal data", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);
    await seedBrokerOnboarding(harness.runtime);

    const response = await post(harness, application(), "203.0.113.30");

    expect(response.status).toBe(202);
    const raw = await response.text();
    const body = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["message", "nextSteps", "publicReference", "status"]);
    expect(body.status).toBe("received");
    expect(String(body.publicReference)).toMatch(/^PA-\d{4}-/);
    for (const personalValue of [CONTACT_EMAIL, CONTACT_PHONE, LEGAL_NAME, "Awa Kone", "LIC-CANDIDAT-001"]) {
      expect(raw, personalValue).not.toContain(personalValue);
    }
    expect(harness.runtime.audit.writer.search({ action: "partner_application.received" })).toHaveLength(1);
  });

  it("refuses the submission when broker onboarding is off for the country", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);

    const response = await post(harness, application(), "203.0.113.31");

    expect(response.status).toBe(422);
    const refusals = harness.runtime.audit.writer.search({ action: "partner_application.refused" });
    expect(refusals).toHaveLength(1);
    expect(refusals[0]?.reason).toBe("broker_onboarding_disabled");
    expect(harness.runtime.audit.writer.search({ action: "partner_application.received" })).toHaveLength(0);
  });

  it("returns the original reference when the same broker applies twice", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);
    await seedBrokerOnboarding(harness.runtime);

    const first = await post(harness, application(), "203.0.113.32");
    const second = await post(harness, application({ message: "Relance de notre candidature." }), "203.0.113.32");

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    const firstBody = await first.json() as { publicReference: string };
    const secondBody = await second.json() as { publicReference: string };
    expect(secondBody.publicReference).toBe(firstBody.publicReference);
    expect(harness.runtime.audit.writer.search({ action: "partner_application.received" })).toHaveLength(1);
    expect(harness.runtime.audit.writer.search({ action: "partner_application.duplicate_ignored" })).toHaveLength(1);
  });
});
