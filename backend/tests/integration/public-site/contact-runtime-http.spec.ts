import { afterEach, describe, expect, it } from "vitest";
import { createRuntimeHttpHarness, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const AUDIENCES = ["visitor", "broker", "insurer", "press"] as const;

describe("public contact runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("accepts a message from every audience and audits each one without the body", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);

    const references = new Set<string>();
    for (const [index, audience] of AUDIENCES.entries()) {
      const response = await harness.request("/contact", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.4${index}` },
        body: JSON.stringify({
          audience,
          name: "Jean Test",
          email: `${audience}@example.com`,
          countryCode: "CI",
          subject: `Question ${audience}`,
          message: "Bonjour, je souhaite en savoir plus sur votre plateforme.",
          consent: true
        })
      });

      expect(response.status, audience).toBe(202);
      const body = await response.json() as { status: string; publicReference: string };
      expect(body.status).toBe("received");
      expect(body.publicReference).toMatch(/^CM-\d{4}-/);
      references.add(body.publicReference);
    }

    expect(references.size).toBe(AUDIENCES.length);
    const received = harness.runtime.audit.writer.search({ action: "contact_message.received" });
    expect(received).toHaveLength(AUDIENCES.length);
    expect(received.map((entry) => (entry.context as { audience?: string } | undefined)?.audience).sort()).toEqual([...AUDIENCES].sort());
    for (const entry of received) {
      expect(JSON.stringify(entry.context)).not.toContain("@example.com");
    }
  });

  it("refuses a filled honeypot", async () => {
    harness = await createRuntimeHttpHarness();
    await seedPublicRuntime(harness.runtime);

    const response = await harness.request("/contact", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.49" },
      body: JSON.stringify({
        audience: "visitor",
        name: "Bot Test",
        email: "bot@example.com",
        subject: "Spam",
        message: "Bonjour, je souhaite en savoir plus sur votre plateforme.",
        consent: true,
        website: "http://spam.example"
      })
    });

    expect(response.status).toBe(400);
    expect(harness.runtime.audit.writer.search({ action: "contact_message.received" })).toHaveLength(0);
  });
});
