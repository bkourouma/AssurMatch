import { describe, expect, it } from "vitest";
import { elapsedBetween, formatElapsed, leadNextStep, leadResponseDelay, receivedAgo } from "../../app/lib/ui/lead-timing";

const NOW = new Date("2026-11-22T12:00:00.000Z").getTime();
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

describe("formatElapsed", () => {
  it("keeps a coarse, readable unit", () => {
    expect(formatElapsed(10 * 60_000)).toBe("moins d'1 h");
    expect(formatElapsed(5 * 3_600_000)).toBe("5 h");
    expect(formatElapsed(47 * 3_600_000)).toBe("47 h");
    expect(formatElapsed(3 * 24 * 3_600_000)).toBe("3 j");
    expect(formatElapsed(Number.NaN)).toBe("moins d'1 h");
    expect(formatElapsed(-5)).toBe("moins d'1 h");
  });
});

describe("elapsedBetween and receivedAgo", () => {
  it("returns undefined for a missing or invalid date", () => {
    expect(elapsedBetween(undefined, hoursAgo(1))).toBeUndefined();
    expect(elapsedBetween("not a date", hoursAgo(1))).toBeUndefined();
    expect(receivedAgo("", NOW)).toBeUndefined();
  });

  it("words the time since reception", () => {
    expect(elapsedBetween(hoursAgo(3), hoursAgo(1))).toBe(2 * 3_600_000);
    expect(receivedAgo(hoursAgo(5), NOW)).toBe("Reçu il y a 5 h");
  });
});

describe("leadResponseDelay", () => {
  it("shows the waiting time of a lead without decision", () => {
    expect(leadResponseDelay({ status: "seen", assignedAt: hoursAgo(26), events: [], nowMs: NOW })).toEqual({ state: "waiting", label: "En attente de votre réponse depuis 26 h" });
  });

  it("shows how long the acceptance took, from the history", () => {
    const delay = leadResponseDelay({
      status: "accepted",
      assignedAt: hoursAgo(10),
      events: [{ eventType: "accepted", occurredAt: hoursAgo(7) }],
      nowMs: NOW
    });
    expect(delay).toEqual({ state: "decided", label: "Accepté 3 h après réception" });
  });

  it("shows nothing for a closed lead without a decision event", () => {
    expect(leadResponseDelay({ status: "closed", assignedAt: hoursAgo(10), events: [], nowMs: NOW })).toBeUndefined();
  });
});

describe("leadNextStep", () => {
  const base = { tenantReadOnly: false, isFinal: false, canMutate: true, canAccept: false, canClose: false, canDispute: false };

  it("asks for a decision on a lead that can be accepted", () => {
    const step = leadNextStep({ ...base, canAccept: true });
    expect(step.title).toBe("À faire : décider");
    expect(step.links.map((link) => link.href)).toEqual(["#actions-lead"]);
  });

  it("points to the proposal, the conversation and the actions on an accepted lead", () => {
    const step = leadNextStep({ ...base, canClose: true });
    expect(step.links.map((link) => link.href)).toEqual(["#repondre-au-visiteur", "#conversation", "#actions-lead"]);
  });

  it("explains why nothing can be done: suspended, closed, read-only role", () => {
    expect(leadNextStep({ ...base, tenantReadOnly: true, canAccept: true }).title).toBe("Consultation seule");
    expect(leadNextStep({ ...base, isFinal: true }).title).toBe("Dossier terminé");
    expect(leadNextStep({ ...base, canMutate: false }).text).toContain("Votre rôle ne permet pas d'agir");
  });
});
