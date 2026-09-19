import { afterEach, describe, expect, it } from "vitest";
import type { ActorContext } from "../../../src/modules/common/types";
import {
  actorHeaders,
  createRuntimeHttpHarness,
  seedBrokerOnboarding,
  seedPublicRuntime,
  type RuntimeHttpHarness
} from "../runtime-http-test-utils";

const COMPLIANCE_ADMIN: ActorContext = {
  actorId: "00000000-0000-4000-8000-0000000000c1",
  roles: ["compliance_admin"],
  mfaVerified: true
};
const SUPPORT_ADMIN: ActorContext = {
  actorId: "00000000-0000-4000-8000-0000000000c2",
  roles: ["support_admin"],
  mfaVerified: true
};

describe("public site admin reads runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("refuses both back-office reads without authentication", async () => {
    harness = await createRuntimeHttpHarness();

    for (const path of ["/admin/partners/applications", "/admin/contact-messages"]) {
      const response = await harness.request(path);
      expect(response.status, path).toBe(401);
    }
  });

  it("returns the stored applications to a compliance admin without the applicant e-mail", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);
    await seedBrokerOnboarding(harness.runtime);
    await harness.request("/partners/applications", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.70" },
      body: JSON.stringify({
        legalName: "Courtier Backoffice SARL",
        countryCode: "CI",
        licenseNumber: "LIC-BACKOFFICE-1",
        licenseExpiresAt: "2030-01-01",
        productKeys: ["auto"],
        monthlyCapacity: 12,
        contactName: "Moussa Diallo",
        contactEmail: "moussa.diallo@courtier.example",
        contactPhone: "+2250102030411",
        desiredPlan: "pro",
        consent: true
      })
    });

    const response = await harness.request("/admin/partners/applications", { headers: actorHeaders(COMPLIANCE_ADMIN) });

    expect(response.status).toBe(200);
    const raw = await response.text();
    const rows = JSON.parse(raw) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ legalName: "Courtier Backoffice SARL", status: "received", desiredPlan: "pro" });
    expect(Object.keys(rows[0] ?? {})).not.toContain("contactEmail");
    expect(raw).not.toContain("moussa.diallo@courtier.example");
    expect(harness.runtime.audit.writer.search({ action: "partner_application.admin_listed" })).toHaveLength(1);
  });

  it("returns the contact inbox to a support admin without the fingerprint or hashed IP", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);
    await harness.request("/contact", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.71" },
      body: JSON.stringify({
        audience: "broker",
        name: "Fatou Sow",
        email: "fatou.sow@example.com",
        subject: "Partenariat",
        message: "Bonjour, je souhaite discuter d'un partenariat avec vos equipes.",
        consent: true
      })
    });

    const response = await harness.request("/admin/contact-messages", { headers: actorHeaders(SUPPORT_ADMIN) });

    expect(response.status).toBe(200);
    const rows = await response.json() as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ audience: "broker", subject: "Partenariat", status: "new" });
    for (const key of ["emailFingerprint", "ipHash"]) {
      expect(Object.keys(rows[0] ?? {}), key).not.toContain(key);
    }
    expect(harness.runtime.audit.writer.search({ action: "contact_message.admin_listed" })).toHaveLength(1);
  });
});
