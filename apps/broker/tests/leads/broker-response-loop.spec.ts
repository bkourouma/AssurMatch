import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { canAssignCrmLead } from "../../app/lib/broker-permissions";
import { buildProposalPayload, formatPremium, proposalOutcome } from "../../app/lib/proposal-vocabulary";
import { LEAD_PROPOSAL_NON_CONTRACTUAL_NOTICE, VISITOR_DECLINE_REASONS } from "../../../../packages/shared/contracts/lead-proposals";

const read = (path: string) => readFileSync(path, "utf8");

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

test("Starter lead page offers \"Répondre au visiteur\" and nothing of the CRM (constitution 1.3.0)", async () => {
  const page = read("apps/broker/app/leads/[leadAssignmentId]/page.tsx");
  expect(page).toContain("Répondre au visiteur");
  expect(page).toContain('channel="starter"');
  expect(page).toContain('readLeadProposals("starter", leadAssignmentId)');
  expect(page).toContain("Coordonnees completes visibles par votre cabinet");
  for (const crmOnly of ["changeCrmLeadStatusAction", "addCrmLeadTaskAction", "addCrmLeadReminderAction", "assignCrmAdvisorAction", "/crm/kanban"]) {
    expect(page).not.toContain(crmOnly);
  }
  const route = read("apps/broker/app/leads/[leadAssignmentId]/proposals/route.ts");
  expect(route).toContain("/broker/starter/leads/${leadAssignmentId}/proposals");
  expect(route).toContain("isSameOrigin(request)");
});

test("the proposal composer is a server-relayed multipart form with the non-contractual mention", async () => {
  const panel = read("apps/broker/app/lib/ui/proposal-panel.tsx");
  const vocabulary = read("apps/broker/app/lib/proposal-vocabulary.ts");
  expect(panel).toContain('encType="multipart/form-data"');
  expect(panel).toContain('accept="application/pdf"');
  expect(panel).toContain("PROPOSAL_NON_CONTRACTUAL_NOTICE");
  expect(panel).toContain("formAction={withdrawProposalAction}");
  expect(panel).toContain("TenantWriteGuard");
  expect(panel).toContain("AssurMatch ne compare, ne classe ni ne recommande les propositions");
  expect(panel).not.toContain("use client");
  // Same wording as the shared contract (FR-004).
  expect(vocabulary).toContain(`"${LEAD_PROPOSAL_NON_CONTRACTUAL_NOTICE.fr}"`);
  for (const reason of VISITOR_DECLINE_REASONS) expect(vocabulary).toContain(`${reason}:`);
  for (const forbidden of ["acceptee", "Acceptée", "souscrire", "contrat signe"]) expect(panel).not.toContain(forbidden);
});

test("uploads and downloads go through route handlers that keep the session token server-side", async () => {
  const relay = read("apps/broker/app/lib/broker-upload.ts");
  expect(relay).toContain("getBackOfficeToken");
  expect(relay).toContain('"cache-control": "no-store"');
  expect(relay).not.toContain("use client");
  for (const [path, api] of [
    ["apps/broker/app/crm/leads/[leadAssignmentId]/proposals/route.ts", "/broker/crm/leads/${leadAssignmentId}/proposals"],
    ["apps/broker/app/crm/leads/[leadAssignmentId]/documents/route.ts", "/broker/crm/leads/${leadAssignmentId}/documents"],
    ["apps/broker/app/crm/leads/[leadAssignmentId]/proposals/[proposalId]/document/route.ts", "/broker/crm/leads/${leadAssignmentId}/proposals/${proposalId}/document"],
    ["apps/broker/app/leads/[leadAssignmentId]/proposals/[proposalId]/document/route.ts", "/broker/starter/leads/${leadAssignmentId}/proposals/${proposalId}/document"],
    ["apps/broker/app/crm/leads/[leadAssignmentId]/documents/[documentId]/file/route.ts", "/broker/crm/leads/${leadAssignmentId}/documents/${documentId}/file"]
  ] as const) {
    const source = read(path);
    expect(source, path).toContain(api);
    expect(source, path).toContain("UUID.test");
  }
});

test("the CRM lead page completes the CRM tools of spec 055", async () => {
  const page = read("apps/broker/app/crm/leads/[leadAssignmentId]/page.tsx");
  expect(page).toContain('{ key: "propositions", label: "Propositions" }');
  expect(page).toContain('channel="crm"');
  expect(page).toContain("Coordonnees du visiteur");
  expect(page).toContain("mailto:");
  expect(page).toContain("action={assignCrmAdvisorAction}");
  expect(page).toContain("Televerser le document interne");
  expect(page).toContain("ne sont jamais visibles du visiteur");
  expect(page).toContain('href="/crm/kanban"');
  const kanban = read("apps/broker/app/crm/kanban/page.tsx");
  expect(kanban).toContain("readCrmKanban");
  expect(kanban).toContain("isStarterCrmDenied");
  expect(read("apps/broker/app/lib/ui/proposal-panel.tsx")).toContain("Le statut CRM n'est jamais modifie automatiquement");
  expect(read("apps/broker/app/lib/ui/broker-shell.tsx")).toContain('href: "/crm/kanban"');
});

test("the composer payload is validated before it reaches the API", async () => {
  const now = new Date("2026-10-03T10:00:00.000Z");
  const valid = buildProposalPayload(form({ message: " Bonjour ", priceMin: "85 000", priceMax: "110000", currency: "xof", guarantees: "RC\n\nBris de glace\n", validUntil: "2026-10-20" }), now);
  expect(valid).toEqual({ ok: true, payload: { message: "Bonjour", priceMin: 85000, priceMax: 110000, currency: "XOF", guarantees: ["RC", "Bris de glace"], validUntil: "2026-10-20T23:59:59.000Z" } });
  expect(buildProposalPayload(form({ message: "Bonjour", currency: "XOF", validUntil: "2026-10-20" }), now).ok).toBe(false);
  expect(buildProposalPayload(form({ message: "Bonjour", priceMin: "2", priceMax: "1", validUntil: "2026-10-20" }), now).ok).toBe(false);
  expect(buildProposalPayload(form({ message: "Bonjour", priceMin: "2", validUntil: "2026-10-01" }), now).ok).toBe(false);
  expect(buildProposalPayload(form({ message: "Bonjour", priceMin: "2", validUntil: "2026-10-20", guarantees: Array.from({ length: 21 }, (_, index) => `G${index}`).join("\n") }), now).ok).toBe(false);
  expect(formatPremium(85000, 110000, "XOF")).toContain("a");
  expect(proposalOutcome({ status: 422, code: "FORBIDDEN_WORDING" }, "sent")).toBe("forbidden_wording");
  expect(proposalOutcome({ status: 422, code: "DOCUMENT_QUARANTINED" }, "sent")).toBe("quarantined");
  expect(proposalOutcome({ status: 409, code: "LEAD_NOT_ACCEPTED" }, "sent")).toBe("not_accepted");
  expect(proposalOutcome({ status: 403, code: "PARTNER_SUSPENDED" }, "sent")).toBe("suspended");
  expect(proposalOutcome({ status: 201 }, "sent")).toBe("sent");
});

test("only owners and managers may assign a lead to an advisor, never while suspended", async () => {
  const profile = (roles: string[], extra: Record<string, unknown> = {}) => ({ roles, partnerTenantId: "t", partnerPlan: "pro" as const, mfaVerified: true, ...extra });
  expect(canAssignCrmLead(profile(["broker_owner_pro"]))).toBe(true);
  expect(canAssignCrmLead(profile(["broker_manager"]))).toBe(true);
  expect(canAssignCrmLead(profile(["broker_agent"]))).toBe(false);
  expect(canAssignCrmLead(profile(["broker_read_only"]))).toBe(false);
  expect(canAssignCrmLead(profile(["broker_owner_pro"], { tenantReadOnly: true }))).toBe(false);
});
