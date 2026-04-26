import { describe, expect, it } from "vitest";
import { resolveDashboardWindow } from "../../../src/modules/dashboards/dashboard-time-window";

describe("resolveDashboardWindow", () => {
  it("defaults to a 30-day window ending now", () => {
    const now = new Date("2026-04-26T12:00:00.000Z");
    const window = resolveDashboardWindow(undefined, now);
    expect(window.dto.to).toBe(now.toISOString());
    expect(new Date(window.dto.from).getTime()).toBe(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  });

  it("rejects windows wider than 365 days", () => {
    expect(() => resolveDashboardWindow({
      from: "2024-01-01T00:00:00.000Z",
      to: "2026-04-26T00:00:00.000Z"
    })).toThrowError(/365/);
  });

  it("rejects windows shorter than 1 day", () => {
    expect(() => resolveDashboardWindow({
      from: "2026-04-26T00:00:00.000Z",
      to: "2026-04-26T05:00:00.000Z"
    })).toThrowError(/1 day/);
  });

  it("rejects future windows", () => {
    expect(() => resolveDashboardWindow({
      from: "2999-04-26T00:00:00.000Z",
      to: "2999-12-26T00:00:00.000Z"
    }, new Date("2026-04-26T00:00:00.000Z"))).toThrowError(/future/);
  });

  it("rejects from >= to", () => {
    expect(() => resolveDashboardWindow({
      from: "2026-04-26T05:00:00.000Z",
      to: "2026-04-25T05:00:00.000Z"
    })).toThrowError(/before to/);
  });
});
