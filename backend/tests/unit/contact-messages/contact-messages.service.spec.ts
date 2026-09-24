import { beforeEach, describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { InMemoryRedisClient } from "../../../src/modules/common/redis/redis.module";
import type { ActorContext } from "../../../src/modules/common/types";
import type { Country } from "../../../src/modules/countries/countries.module";
import {
  ContactMessagesService,
  type ContactMessagesDependencies
} from "../../../src/modules/contact-messages/contact-messages.module";

const KNOWN_COUNTRY_ID = "country-civ";
const KNOWN_COUNTRY_CODE = "CI";

function fakeCountry(): Country {
  return { id: KNOWN_COUNTRY_ID } as unknown as Country;
}

function deps(): ContactMessagesDependencies {
  return {
    findCountryByCode: (countryCode: string) => (countryCode === KNOWN_COUNTRY_CODE ? fakeCountry() : undefined)
  };
}

function actorFor(roles: ActorContext["roles"] = []): ActorContext {
  return { actorId: "actor-1", roles };
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    audience: "visitor",
    name: "Jean Kouassi",
    email: "jean.kouassi@example.com",
    phone: "+2250700000000",
    countryCode: KNOWN_COUNTRY_CODE,
    subject: "Question sur mon devis",
    message: "Bonjour, je voudrais des informations complementaires sur mon devis d'assurance auto.",
    consent: true,
    ...overrides
  };
}

function makeService(audit = new AuditLogWriter()): { service: ContactMessagesService; audit: AuditLogWriter } {
  const service = new ContactMessagesService(deps(), audit, new InMemoryRedisClient());
  return { service, audit };
}

describe("ContactMessagesService", () => {
  let anonymousActor: ActorContext;

  beforeEach(() => {
    anonymousActor = actorFor();
  });

  it("accepts a submission for each of the four audiences", async () => {
    const { service } = makeService();

    for (const audience of ["visitor", "broker", "insurer", "press"] as const) {
      const response = await service.submit(validPayload({ audience }), { ipAddress: `203.0.113.${audience.length}`, actor: anonymousActor });
      expect(response.status).toBe("received");
      expect(response.publicReference).toMatch(/^CM-\d{4}-[0-9a-f]{8}$/);
    }
  });

  it("refuses a submission with an unresolvable country code", async () => {
    const { service } = makeService();

    await expect(
      service.submit(validPayload({ countryCode: "ZZ" }), { ipAddress: "203.0.113.20", actor: anonymousActor })
    ).rejects.toThrow("Country not found");
  });

  it("refuses a submission with a filled honeypot", async () => {
    const { service } = makeService();

    await expect(
      service.submit(validPayload({ website: "https://spam.example" }), { ipAddress: "203.0.113.30", actor: anonymousActor })
    ).rejects.toThrow("Invalid submission: spam_blocked");
  });

  it("triggers the per-IP rate limit after five submissions in the window", async () => {
    const { service } = makeService();
    const ipAddress = "203.0.113.40";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.submit(validPayload(), { ipAddress, actor: anonymousActor })).resolves.toMatchObject({ status: "received" });
    }

    await expect(service.submit(validPayload(), { ipAddress, actor: anonymousActor })).rejects.toThrow("Rate limit exceeded for public submissions");
  });

  it("returns a response that carries no personal data", async () => {
    const { service } = makeService();

    const response = await service.submit(validPayload(), { ipAddress: "203.0.113.50", actor: anonymousActor });

    expect(Object.keys(response).sort()).toEqual(["message", "publicReference", "status"]);
    expect(response.message).not.toContain("jean.kouassi@example.com");
    expect(response.message).not.toContain("+2250700000000");
    // No service-level commitment or delay promise: the reply only says the message was received.
    expect(response.message.toLowerCase()).not.toMatch(/heure|jour|delai|48h|24h/);
  });

  it("keeps the raw e-mail and the message body out of the audit context", async () => {
    const { service, audit } = makeService();

    await service.submit(validPayload(), { ipAddress: "203.0.113.60", actor: anonymousActor });

    const [entry] = audit.search({ action: "contact_message.received" });
    if (!entry) throw new Error("expected a contact_message.received audit entry");
    const serializedContext = JSON.stringify(entry.context);
    expect(serializedContext).not.toContain("jean.kouassi@example.com");
    expect(serializedContext).not.toContain("Question sur mon devis");
    expect(serializedContext).not.toContain("Bonjour, je voudrais");
    expect(entry.context.audience).toBe("visitor");
    expect(entry.context.countryId).toBe(KNOWN_COUNTRY_ID);
    expect(entry.context.subjectLength).toBe("Question sur mon devis".length);
    expect(typeof entry.context.emailFingerprint).toBe("string");
  });

  it("refuses an unauthorised actor from listing the admin inbox", async () => {
    const { service } = makeService();

    await service.submit(validPayload(), { ipAddress: "203.0.113.70", actor: anonymousActor });

    await expect(service.listForAdmin(actorFor(["broker_owner_starter"]), {})).rejects.toThrow("Contact message access denied");
  });

  it("lets an authorised admin list the inbox without exposing the fingerprint or IP hash", async () => {
    const { service } = makeService();
    await service.submit(validPayload(), { ipAddress: "203.0.113.80", actor: anonymousActor });

    const rows = await service.listForAdmin(actorFor(["support_admin"]), {});

    expect(rows).toHaveLength(1);
    const [row] = rows;
    if (!row) throw new Error("expected an admin row");
    expect(row).not.toHaveProperty("emailFingerprint");
    expect(row).not.toHaveProperty("ipHash");
    expect(row.emailNormalized).toBe("jean.kouassi@example.com");
  });
});
