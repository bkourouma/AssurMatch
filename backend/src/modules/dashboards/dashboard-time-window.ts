import type { DashboardTimeWindowQuery, DashboardWindowDto } from "../../../../packages/shared/contracts/dashboard.contracts";
import { DashboardWindowDefaults } from "../../../../packages/shared/contracts/dashboard.contracts";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ResolvedDashboardWindow {
  from: Date;
  to: Date;
  dto: DashboardWindowDto;
}

export function resolveDashboardWindow(query: DashboardTimeWindowQuery | undefined, now: Date = new Date()): ResolvedDashboardWindow {
  const to = query?.to ? new Date(query.to) : now;
  const from = query?.from ? new Date(query.from) : new Date(to.getTime() - DashboardWindowDefaults.defaultDays * DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("Invalid dashboard window");
  }
  if (from.getTime() >= to.getTime()) {
    throw new Error("Window from must be before to");
  }
  const span = to.getTime() - from.getTime();
  if (span > DashboardWindowDefaults.maxDays * DAY_MS) {
    throw new Error("Window exceeds 365 days");
  }
  if (span < DashboardWindowDefaults.minDays * DAY_MS) {
    throw new Error("Window is shorter than 1 day");
  }
  if (to.getTime() > now.getTime() + DAY_MS) {
    throw new Error("Window cannot extend into the future");
  }
  return {
    from,
    to,
    dto: { from: from.toISOString(), to: to.toISOString() }
  };
}

export function isWithinWindow(date: Date | string, window: ResolvedDashboardWindow): boolean {
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return false;
  return value.getTime() >= window.from.getTime() && value.getTime() <= window.to.getTime();
}
