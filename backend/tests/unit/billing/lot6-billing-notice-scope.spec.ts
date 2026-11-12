import { describe, expect, it } from "vitest";
import { findForbiddenWordingAnyLanguage } from "../../../../packages/shared/contracts/content-safety";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { toSafeErrorResponse } from "../../../src/modules/common/filters/error-response.filter";
import { BillingAccessRefusedError, BillingFoundationService } from "../../../src/modules/billing/billing-foundation.service";
import { STATEMENT_NOTICE } from "../../../src/modules/billing/invoicing.service";

function service() {
  return new BillingFoundationService({ audit: new AuditLogWriter() } as never);
}

describe("broker billing notice (A-03h)", () => {
  it("is written with its French accents and states that AssurMatch collects nothing", () => {
    expect(STATEMENT_NOTICE).toContain("Règlement par virement bancaire ou mobile money hors plateforme");
    expect(STATEMENT_NOTICE).toContain("aucune prime d'assurance encaissée par AssurMatch");
    expect(STATEMENT_NOTICE).toMatch(/^Facturation manuelle: aucun paiement en ligne,/u);
    expect(STATEMENT_NOTICE).not.toMatch(/reglement|encaissee/u);
    expect(findForbiddenWordingAnyLanguage(STATEMENT_NOTICE)).toEqual([]);
  });
});

describe("billing foundation refusal causes (missing_billing_scope)", () => {
  it("a Finance Admin without scope gets 403 BILLING_SCOPE_MISSING, not a role message", async () => {
    const error = await service().read({ actorId: "f", roles: ["finance_admin"], mfaVerified: true }, {} as never).catch((reason: unknown) => reason) as { getStatus(): number };
    expect(error.getStatus()).toBe(403);
    expect(error).not.toBeInstanceOf(BillingAccessRefusedError);
    const body = toSafeErrorResponse(error, "c1", 403);
    expect(body.code).toBe("BILLING_SCOPE_MISSING");
    expect(body.message).toBe("Billing access refused: no billing scope assigned to this account");
    expect(body.message).not.toMatch(/role/i);
  });

  it("a role without billing permission keeps the role refusal", async () => {
    const error = await service().read({ actorId: "b", roles: ["broker_owner_pro"], mfaVerified: true }, {} as never).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(BillingAccessRefusedError);
    expect((error as BillingAccessRefusedError).message).toBe("Billing access denied: forbidden_role");
  });
});
