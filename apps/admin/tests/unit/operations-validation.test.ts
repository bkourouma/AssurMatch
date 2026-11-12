import { describe, expect, it } from "vitest";
import {
  REASON_MIN_LENGTH,
  REASON_TOO_SHORT_MESSAGE,
  refusalMessage,
  validateOptionalReason,
  validateRequiredReason
} from "../../app/lib/operations-validation";
import { assignmentStatusLabel } from "../../app/lib/ui/operations-labels";

describe("operations reason validation", () => {
  it("mirrors the backend minimum of 8 characters", () => {
    expect(REASON_MIN_LENGTH).toBe(8);
    expect(validateRequiredReason("")).toBe(REASON_TOO_SHORT_MESSAGE);
    expect(validateRequiredReason("1234567")).toBe("Le motif doit contenir au moins 8 caractères.");
    expect(validateRequiredReason("12345678")).toBeNull();
  });

  it("caps the reason at 500 characters", () => {
    expect(validateRequiredReason("a".repeat(501))).toMatch(/500 caractères/);
    expect(validateOptionalReason("")).toBeNull();
    expect(validateOptionalReason("a".repeat(501))).toMatch(/500/);
  });
});

describe("operations refusal messages", () => {
  it("never leaks the technical API message", () => {
    for (const status of [0, 400, 401, 403, 404, 409, 422, 500]) {
      const message = refusalMessage(status);
      expect(message).not.toMatch(/Validation failed|Détail/);
      expect(message.length).toBeGreaterThan(10);
    }
  });

  it("gives a generic French message for an unknown status", () => {
    expect(refusalMessage(418)).toMatch(/^Action refusée par le serveur/);
    expect(refusalMessage(400)).toMatch(/^Saisie invalide/);
  });
});

describe("assignment status labels", () => {
  it("translates known statuses and humanizes unknown ones", () => {
    expect(assignmentStatusLabel("closed")).toBe("Clôturé");
    expect(assignmentStatusLabel("some_new_status")).toBe("Some new status");
  });
});
