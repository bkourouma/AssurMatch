import { afterEach, describe, expect, it } from "vitest";
import {
  adminPartnerSlaRowSchema,
  brokerBrandingSchema,
  partnerAgencySchema,
  partnerCustomRoleSchema,
  partnerSlaSchema
} from "../../../../packages/shared/contracts/enterprise.contracts";
import { EnterpriseAuditActions } from "../../../src/modules/enterprise/enterprise-audit-actions";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, seedPublicRuntime, type RuntimeHttpHarness } from "../runtime-http-test-utils";

const superAdmin: ActorContext = { actorId: "super-admin", roles: ["super_admin"], mfaVerified: true };
const TENANT = "00000000-0000-4000-8000-00000000e001";
const OTHER_TENANT = "00000000-0000-4000-8000-00000000e002";
const owner: ActorContext = { actorId: "owner", roles: ["broker_owner_pro"], partnerTenantId: TENANT, partnerPlan: "enterprise", mfaVerified: true };
const manager: ActorContext = { actorId: "manager", roles: ["broker_manager"], partnerTenantId: TENANT, partnerPlan: "enterprise", mfaVerified: true };
const proOwner: ActorContext = { actorId: "pro", roles: ["broker_owner_pro"], partnerTenantId: TENANT, partnerPlan: "pro", mfaVerified: true };
const otherOwner: ActorContext = { actorId: "other", roles: ["broker_owner_pro"], partnerTenantId: OTHER_TENANT, partnerPlan: "enterprise", mfaVerified: true };
const json = { "content-type": "application/json" };

describe("enterprise agencies, roles, SLA and branding runtime HTTP", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("gates every enterprise capability on the Enterprise plan and the owner permission", async () => {
    harness = await createRuntimeHttpHarness();

    expect((await harness.request("/broker/enterprise/agencies", { headers: actorHeaders(proOwner) })).status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: EnterpriseAuditActions.accessRefused })[0]?.reason).toBe("plan_enterprise_required");
    expect((await harness.request("/broker/enterprise/agencies", { method: "POST", headers: { ...actorHeaders(manager), ...json }, body: JSON.stringify({ name: "Agence Plateau", countryCode: "CI", reason: "Ouverture agence" }) })).status).toBe(403);
    expect(harness.runtime.audit.writer.search({ action: EnterpriseAuditActions.accessRefused }).at(-1)?.reason).toBe("owner_permission_required");
    expect((await harness.request("/broker/enterprise/agencies", { headers: actorHeaders(manager) })).status).toBe(200);
  });

  it("keeps agencies tenant-bound and caps custom roles to the broker permission catalogue", async () => {
    harness = await createRuntimeHttpHarness();

    const agency = partnerAgencySchema.parse(await readJson(await harness.request("/broker/enterprise/agencies", {
      method: "POST",
      headers: { ...actorHeaders(owner), ...json },
      body: JSON.stringify({ name: "Agence Plateau", countryCode: "CI", city: "Abidjan", reason: "Ouverture agence" })
    })));
    expect(agency).toMatchObject({ partnerTenantId: TENANT, name: "Agence Plateau", status: "active", memberCount: 0 });

    const withMember = partnerAgencySchema.parse(await readJson(await harness.request(`/broker/enterprise/agencies/${agency.id}/members`, {
      method: "POST",
      headers: { ...actorHeaders(owner), ...json },
      body: JSON.stringify({ memberId: "advisor-1", reason: "Rattachement conseiller" })
    })));
    expect(withMember.memberCount).toBe(1);

    expect(await readJson<unknown[]>(await harness.request("/broker/enterprise/agencies", { headers: actorHeaders(otherOwner) }))).toHaveLength(0);
    expect((await harness.request(`/broker/enterprise/agencies/${agency.id}`, { method: "PATCH", headers: { ...actorHeaders(otherOwner), ...json }, body: JSON.stringify({ status: "suspended", reason: "tentative" }) })).status).toBe(404);

    const role = partnerCustomRoleSchema.parse(await readJson(await harness.request("/broker/enterprise/roles", {
      method: "POST",
      headers: { ...actorHeaders(owner), ...json },
      body: JSON.stringify({ name: "Conseiller senior", permissions: ["broker_crm:read", "broker_crm:update", "users:*", "billing:*", "feature_flags:update"], reason: "Role interne" })
    })));
    expect(role.permissions).toEqual(["broker_crm:read", "broker_crm:update"]);
    expect(role.rejectedPermissions).toEqual(["users:*", "billing:*", "feature_flags:update"]);
    expect(harness.runtime.audit.writer.search({ action: EnterpriseAuditActions.customRoleCreated })[0]?.context).toMatchObject({ rejectedPermissions: ["users:*", "billing:*", "feature_flags:update"] });

    // The grant can never exceed what the member's base role already allows.
    const readOnly: ActorContext = { actorId: "ro", roles: ["broker_read_only"], partnerTenantId: TENANT, partnerPlan: "enterprise", mfaVerified: true };
    expect(harness.runtime.enterprise.effectivePermissions(readOnly, role)).toEqual(["broker_crm:read"]);
    expect(harness.runtime.enterprise.effectivePermissions(owner, role)).toEqual(["broker_crm:read", "broker_crm:update"]);
    expect((await harness.request("/broker/enterprise/roles", { method: "POST", headers: { ...actorHeaders(owner), ...json }, body: JSON.stringify({ name: "Invalide", permissions: ["users:*"], reason: "Role interne" }) })).status).toBe(400);
  });

  it("computes SLA compliance and keeps branding inside the broker back-office", async () => {
    harness = await createRuntimeHttpHarness();
    const seed = await seedPublicRuntime(harness.runtime);

    const fast = await harness.runtime.leads.assignments.create({ quoteRequestId: "q-sla-1", partnerTenantId: TENANT, assignmentReason: "routing", countryCode: "CI", productKey: "auto" }, superAdmin);
    const slow = await harness.runtime.leads.assignments.create({ quoteRequestId: "q-sla-2", partnerTenantId: TENANT, assignmentReason: "routing", countryCode: "CI", productKey: "auto" }, superAdmin);
    fast.seenAt = new Date(fast.assignedAt.getTime() + 30 * 60_000);
    slow.seenAt = new Date(slow.assignedAt.getTime() + 120 * 60_000);

    const updated = partnerSlaSchema.parse(await readJson(await harness.request("/broker/enterprise/sla", {
      method: "PUT",
      headers: { ...actorHeaders(owner), ...json },
      body: JSON.stringify({ firstActionTargetMinutes: 60, reason: "Engagement de reactivite" })
    })));
    expect(updated).toMatchObject({ firstActionTargetMinutes: 60, leadsMeasured: 2, leadsWithinTarget: 1, complianceRate: 0.5, averageFirstActionMinutes: 75 });

    const branding = brokerBrandingSchema.parse(await readJson(await harness.request("/broker/enterprise/branding", {
      method: "PUT",
      headers: { ...actorHeaders(owner), ...json },
      body: JSON.stringify({ displayLabel: "Groupe Ivoire Assurances", primaryColor: "#0f766e", reason: "Charte interne" })
    })));
    expect(branding).toMatchObject({ displayLabel: "Groupe Ivoire Assurances", primaryColor: "#0f766e", platformMention: "Plateforme technique AssurMatch" });
    expect(harness.runtime.audit.writer.search({ action: EnterpriseAuditActions.brandingChanged })[0]?.context).toMatchObject({ appliesTo: "broker_back_office_only" });
    expect(partnerSlaSchema.parse(await readJson(await harness.request("/broker/enterprise/sla", { headers: actorHeaders(owner) }))).firstActionTargetMinutes).toBe(60);

    const rows = (await readJson<unknown[]>(await harness.request("/admin/partners/sla", { headers: actorHeaders(superAdmin) }))).map((row) => adminPartnerSlaRowSchema.parse(row));
    expect(rows.some((row) => row.partnerTenantId === seed.partner.id)).toBe(true);
    const support: ActorContext = { actorId: "support", roles: ["support_admin"], mfaVerified: true };
    expect((await harness.request("/admin/partners/sla", { headers: actorHeaders(support) })).status).toBe(200);
    const finance: ActorContext = { actorId: "finance", roles: ["finance_admin"], mfaVerified: true };
    expect((await harness.request("/admin/partners/sla", { headers: actorHeaders(finance) })).status).toBe(403);
  });
});
