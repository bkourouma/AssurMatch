import { describe, expect, it } from "vitest";
import { TENANT, actors, createKit } from "./lead-messaging-kit";

describe("broker duplicate message guard (A-06b)", () => {
  it("refuses an identical broker message within five minutes (409 DUPLICATE_MESSAGE, nothing stored) and accepts it afterwards", async () => {
    let now = new Date("2026-10-15T10:00:00.000Z");
    const kit = await createKit({ now: () => now });
    const assignment = await kit.assign();
    await kit.messages.brokerSend("starter", assignment.id, { body: "Bonjour, je vous rappelle demain." }, [], actors.starter);
    now = new Date(now.getTime() + 60_000);
    await expect(kit.messages.brokerSend("starter", assignment.id, { body: "Bonjour, je vous rappelle demain." }, [], actors.starter))
      .rejects.toMatchObject({ status: 409, response: { code: "DUPLICATE_MESSAGE", message: "The same message was just sent" } });
    expect(await kit.repository.countForConversation(assignment.id, TENANT)).toBe(1);
    // A different text goes through, and the same text again after the window as well.
    await kit.messages.brokerSend("starter", assignment.id, { body: "Un autre message." }, [], actors.starter);
    now = new Date(now.getTime() + 6 * 60_000);
    await kit.messages.brokerSend("starter", assignment.id, { body: "Un autre message." }, [], actors.starter);
    expect(await kit.repository.countForConversation(assignment.id, TENANT)).toBe(3);
  });
});
