import { describe, expect, it } from "vitest";
import { daysSince, formatDateTime, formatWaiting, nextCrmDeadline } from "../../app/lib/ui/broker-view-models";

const NOW = new Date("2026-11-22T09:00:00.000Z");

describe("dashboard waiting time", () => {
  it("counts whole UTC days since the assignment date", () => {
    expect(daysSince("2026-11-22", NOW)).toBe(0);
    expect(daysSince("2026-11-21T23:59:00.000Z", NOW)).toBe(1);
    expect(daysSince("2026-11-18", NOW)).toBe(4);
  });

  it("never invents a delay for a missing or unreadable date", () => {
    expect(daysSince(undefined, NOW)).toBeUndefined();
    expect(daysSince("-", NOW)).toBeUndefined();
    expect(daysSince("not a date", NOW)).toBeUndefined();
    expect(formatWaiting(undefined)).toBe("-");
  });

  it("writes the delay in words", () => {
    expect(formatWaiting(0)).toBe("Aujourd'hui");
    expect(formatWaiting(1)).toBe("1 jour");
    expect(formatWaiting(4)).toBe("4 jours");
  });
});

describe("CRM next action", () => {
  it("returns nothing when no task or reminder is scheduled", () => {
    expect(nextCrmDeadline([], [], NOW)).toBeUndefined();
    expect(nextCrmDeadline([{ title: "Rappeler", completedAt: "2026-11-01T10:00:00.000Z", dueAt: "2026-11-02T10:00:00.000Z" }], [], NOW)).toBeUndefined();
  });

  it("picks the earliest open commitment, tasks and upcoming reminders together", () => {
    const next = nextCrmDeadline(
      [{ title: "Envoyer le devis", dueAt: "2026-11-25T10:00:00.000Z" }],
      [{ message: "Relancer", remindAt: "2026-11-23T08:00:00.000Z" }],
      NOW
    );
    expect(next).toEqual({ kind: "reminder", label: "Relancer", at: "2026-11-23T08:00:00.000Z", overdue: false });
  });

  it("puts an overdue task first and flags it", () => {
    const next = nextCrmDeadline(
      [
        { title: "Envoyer le devis", dueAt: "2026-11-25T10:00:00.000Z" },
        { title: "Appeler", dueAt: "2026-11-20T10:00:00.000Z" }
      ],
      [],
      NOW
    );
    expect(next?.label).toBe("Appeler");
    expect(next?.overdue).toBe(true);
  });

  it("ignores a past reminder: it cannot be completed, so it is history", () => {
    expect(nextCrmDeadline([], [{ message: "Passé", remindAt: "2026-11-01T08:00:00.000Z" }], NOW)).toBeUndefined();
  });
});

describe("date and hour display", () => {
  it("keeps the ISO date first so lists stay sortable and searchable", () => {
    expect(formatDateTime("2026-11-25T10:30:00.000Z")).toBe("2026-11-25 10:30 UTC");
    expect(formatDateTime(undefined)).toBe("-");
  });
});
