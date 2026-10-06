import { describe, expect, it } from "vitest";
import {
  projectBrokerStatus,
  projectPublicQuoteStatus,
  publicQuoteStatusViewSchema,
  type ProjectionAssignment,
  type ProjectionQuote
} from "../../../../packages/shared/contracts/public-quote-status";

const created = "2026-10-01T08:00:00.000Z";

function quote(overrides: Partial<ProjectionQuote> = {}): ProjectionQuote {
  return { status: "routed", routingStatus: "assigned", createdAt: created, updatedAt: "2026-10-02T08:00:00.000Z", ...overrides };
}

function assignment(overrides: Partial<ProjectionAssignment> = {}): ProjectionAssignment {
  return {
    id: "a-1",
    partnerName: "Courtier X",
    status: "assigned",
    createdAt: "2026-10-01T08:00:01.000Z",
    assignedAt: "2026-10-01T08:00:01.000Z",
    updatedAt: "2026-10-01T08:00:01.000Z",
    ...overrides
  };
}

const INTERNAL_LABELS = ["injoignable", "hors_cible", "doublon", "rejete_conteste", "contact_tente", "qualifie", "devis_envoye", "negociation", "rejected", "disputed", "broker_notified", "manual_review", "pending_manual_assignment", "non_routable", "gagne", "perdu"];

describe("projectPublicQuoteStatus (spec 054 R5)", () => {
  it("maps assignment and CRM states to the public broker status", () => {
    for (const status of ["assigned", "broker_notified", "seen"] as const) expect(projectBrokerStatus({ status })).toBe("transmitted");
    for (const status of ["accepted", "received", "contacted"] as const) expect(projectBrokerStatus({ status })).toBe("in_progress");
    for (const crmStatus of ["accepte", "contact_tente", "contacte", "qualifie", "documents_demandes", "devis_en_preparation", "devis_envoye", "negociation"]) {
      expect(projectBrokerStatus({ status: "seen", crmStatus })).toBe("in_progress");
    }
    for (const crmStatus of ["gagne", "perdu", "doublon", "injoignable", "hors_cible", "rejete_conteste"]) {
      expect(projectBrokerStatus({ status: "accepted", crmStatus })).toBe("closed");
    }
    for (const status of ["closed", "rejected", "disputed"] as const) expect(projectBrokerStatus({ status, crmStatus: "qualifie" })).toBe("closed");
    expect(projectBrokerStatus({ status: "assigned", crmStatus: "nouveau" })).toBe("transmitted");
  });

  it("derives the global status from the request and its open assignments", () => {
    expect(projectPublicQuoteStatus(quote({ status: "created", routingStatus: "not_started" }), []).status).toBe("received");
    expect(projectPublicQuoteStatus(quote({ status: "manual_review", routingStatus: "manual_review_required" }), []).status).toBe("in_review");
    expect(projectPublicQuoteStatus(quote({ status: "created", routingStatus: "pending_manual_assignment" }), []).status).toBe("in_review");
    expect(projectPublicQuoteStatus(quote({ status: "non_routable", routingStatus: "no_broker_available" }), []).status).toBe("not_transmitted");
    expect(projectPublicQuoteStatus(quote(), [assignment()]).status).toBe("transmitted");
    expect(projectPublicQuoteStatus(quote(), [assignment(), assignment({ id: "a-2", partnerName: "Courtier Y", status: "accepted", acceptedAt: "2026-10-01T09:00:00.000Z" })]).status).toBe("in_progress");
    // The most advanced status among the assignments still open; closed ones do not count.
    expect(projectPublicQuoteStatus(quote(), [assignment({ status: "rejected" }), assignment({ id: "a-2", partnerName: "Courtier Y" })]).status).toBe("transmitted");
    expect(projectPublicQuoteStatus(quote(), [assignment({ status: "closed" })]).status).toBe("closed");
    expect(projectPublicQuoteStatus(quote({ status: "cancelled", refusalReason: "consent_withdrawn" }), [assignment({ status: "closed" })]).status).toBe("closed");
  });

  it("names each broker with its own status for a multi-broker request", () => {
    const projection = projectPublicQuoteStatus(quote(), [
      assignment(),
      assignment({ id: "a-2", partnerName: "Courtier Y", status: "accepted", acceptedAt: "2026-10-01T09:00:00.000Z" })
    ]);
    expect(projection.brokers).toEqual([
      { partnerName: "Courtier X", status: "transmitted", since: "2026-10-01T08:00:01.000Z" },
      { partnerName: "Courtier Y", status: "in_progress", since: "2026-10-01T09:00:00.000Z" }
    ]);
  });

  it("builds a dated timeline with reassignment, acceptance and closure", () => {
    const projection = projectPublicQuoteStatus(quote(), [
      assignment({ partnerName: "Courtier Y", status: "closed", acceptedAt: "2026-10-01T12:00:00.000Z", lastBrokerActionAt: "2026-10-02T08:00:00.000Z" })
    ], [
      { assignmentId: "a-1", eventType: "reassigned", occurredAt: "2026-10-01T10:00:00.000Z", partnerName: "Courtier Y", previousPartnerName: "Courtier X" },
      { assignmentId: "a-1", eventType: "accepted", occurredAt: "2026-10-01T12:00:00.000Z", partnerName: "Courtier Y" }
    ]);
    expect(projection.timeline).toEqual([
      { step: "received", at: created },
      { step: "transmitted", at: "2026-10-01T08:00:01.000Z", partnerName: "Courtier X" },
      { step: "reassigned", at: "2026-10-01T10:00:00.000Z", partnerName: "Courtier Y" },
      { step: "accepted", at: "2026-10-01T12:00:00.000Z", partnerName: "Courtier Y" },
      { step: "closed", at: "2026-10-02T08:00:00.000Z", partnerName: "Courtier Y" }
    ]);
  });

  it("reports the consent withdrawal and never an internal label", () => {
    const projection = projectPublicQuoteStatus(
      quote({ status: "cancelled", refusalReason: "consent_withdrawn", updatedAt: "2026-10-03T08:00:00.000Z" }),
      [assignment({ status: "closed", crmStatus: "injoignable" }), assignment({ id: "a-2", status: "disputed", crmStatus: "rejete_conteste" })]
    );
    expect(projection.consent).toEqual({ withdrawn: true, withdrawnAt: "2026-10-03T08:00:00.000Z" });
    expect(projection.timeline.at(-1)).toEqual({ step: "consent_withdrawn", at: "2026-10-03T08:00:00.000Z" });
    const serialized = JSON.stringify(projection);
    for (const label of INTERNAL_LABELS) expect(serialized).not.toContain(label);
  });

  it("validates as the public contract once completed by the service", () => {
    const projection = projectPublicQuoteStatus(quote(), [assignment()]);
    const view = publicQuoteStatusViewSchema.parse({
      publicReference: "QR-2026-ABCDEF12",
      language: "fr",
      country: { isoCode: "CI", name: "Cote d'Ivoire" },
      product: { key: "auto", name: "Assurance auto" },
      ...projection,
      tokenExpiresAt: null
    });
    expect(view.status).toBe("transmitted");
  });
});
