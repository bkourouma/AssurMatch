import { expect } from "vitest";
import type { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";

export function expectAuditAction(audit: AuditLogWriter, action: string): void {
  expect(audit.all().some((entry) => entry.action === action)).toBe(true);
}
