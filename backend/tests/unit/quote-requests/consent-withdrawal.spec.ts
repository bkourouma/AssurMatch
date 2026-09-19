import { describe, expect, it } from "vitest";
import type { QuoteRequestCreateDto } from "../../../../packages/shared/contracts/quote.contracts";
import type { ActorContext } from "../../../src/modules/common/types";
import { QuoteRequestsModule } from "../../../src/modules/quote-requests/quote-requests.module";
import type { QuoteAssignmentsPort } from "../../../src/modules/quote-requests/quote-submission.service";
import { seedComparatorQuote, validQuotePayload, type ComparatorSeed } from "../../integration/helpers/comparator-quote-seed";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

const visitorActor: ActorContext = { roles: [], correlationId: "withdrawal-correlation" };
const VISITOR_IP = "203.0.113.10";

/**
 * Builds the seeded comparator world, then a quote module wired with the withdrawal dependencies
 * (assignments + partner inbox) and submits one real request through it, so the withdrawal runs
 * against a genuinely routed request with a live assignment.
 */
async function submitWithdrawableQuote(overrides: { assignments?: (seed: ComparatorSeed) => QuoteAssignmentsPort } = {}) {
  const seed = await seedComparatorQuote();
  const quoteRequests = new QuoteRequestsModule({
    countries: seed.app.countries.service,
    products: seed.app.products.service,
    forms: seed.app.quoteForms.service,
    consent: seed.app.consent.service,
    identity: seed.app.prospects.identity,
    prospects: seed.app.prospects.service,
    routing: seed.app.leads.routing,
    notifications: seed.app.notifications.quoteService,
    aiSummary: seed.app.quoteAiSummary,
    assignments: overrides.assignments ? overrides.assignments(seed) : seed.app.leads.assignments,
    inApp: seed.app.notifications.dispatch
  }, seed.app.audit.writer, seed.app.redis.client);

  const confirmation = await quoteRequests.submissions.submit(validQuotePayload(seed) as QuoteRequestCreateDto, superAdminActor);
  const [quote] = await quoteRequests.submissions.list();
  if (!quote) throw new Error("seeded quote request missing");
  return { seed, quoteRequests, confirmation, quote };
}

function withdrawalContext(ipAddress = VISITOR_IP) {
  return { ipAddress, actor: visitorActor };
}

function actionCount(seed: ComparatorSeed, action: string): number {
  return seed.app.audit.writer.all().filter((entry) => entry.action === action).length;
}

async function messageOf(call: Promise<unknown>): Promise<string> {
  try {
    await call;
    throw new Error("expected the call to reject");
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("visitor consent withdrawal", () => {
  it("withdraws the consent, cancels the request, closes the assignment and warns the partner", async () => {
    const { seed, quoteRequests, confirmation, quote } = await submitWithdrawableQuote();
    expect(confirmation.routed).toBe(true);

    const result = await quoteRequests.submissions.withdrawConsent(confirmation.publicReference, confirmation.verificationToken, withdrawalContext());

    expect(result).toMatchObject({ status: "cancelled", publicReference: confirmation.publicReference, alreadyWithdrawn: false });
    expect(result.message).toContain("courtier partenaire");

    const consentRecord = await seed.app.consent.service.findRecord(quote.consentRecordId);
    expect(consentRecord?.status).toBe("withdrawn");
    expect(consentRecord?.withdrawnAt).toBeInstanceOf(Date);

    const stored = await quoteRequests.submissions.findById(quote.id);
    expect(stored?.status).toBe("cancelled");
    expect(stored?.refusalReason).toBe("consent_withdrawn");

    const assignments = await seed.app.leads.assignments.list();
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.status).toBe("closed");
    expect(assignments[0]?.actionReason).toBe("consent_withdrawn");

    const inbox = await seed.app.notifications.dispatch.listInApp(seed.partnerTenantId);
    const withdrawalNotice = inbox.find((notification) => notification.type === "lead_consent_withdrawn");
    expect(withdrawalNotice).toBeDefined();
    expect(withdrawalNotice?.targetId).toBe(assignments[0]?.id);
    expect(withdrawalNotice?.body).toContain(confirmation.publicReference);

    expect(actionCount(seed, "consent.withdrawn_by_visitor")).toBe(1);
    expect(actionCount(seed, "quote_request.cancelled_by_visitor")).toBe(1);
    expect(actionCount(seed, "lead_assignment.closed_consent_withdrawn")).toBe(1);
  });

  it("is idempotent: a second withdrawal changes nothing further", async () => {
    const { seed, quoteRequests, confirmation, quote } = await submitWithdrawableQuote();
    await quoteRequests.submissions.withdrawConsent(confirmation.publicReference, confirmation.verificationToken, withdrawalContext());

    const firstRecord = await seed.app.consent.service.findRecord(quote.consentRecordId);
    const firstWithdrawnAt = firstRecord?.withdrawnAt;
    const inboxBefore = (await seed.app.notifications.dispatch.listInApp(seed.partnerTenantId)).length;

    const second = await quoteRequests.submissions.withdrawConsent(confirmation.publicReference, confirmation.verificationToken, withdrawalContext());

    expect(second).toMatchObject({ status: "cancelled", publicReference: confirmation.publicReference, alreadyWithdrawn: true });
    const secondRecord = await seed.app.consent.service.findRecord(quote.consentRecordId);
    expect(secondRecord?.withdrawnAt).toBe(firstWithdrawnAt);
    expect(actionCount(seed, "consent.withdrawn_by_visitor")).toBe(1);
    expect(actionCount(seed, "quote_request.cancelled_by_visitor")).toBe(1);
    expect(actionCount(seed, "lead_assignment.closed_consent_withdrawn")).toBe(1);
    expect((await seed.app.notifications.dispatch.listInApp(seed.partnerTenantId)).length).toBe(inboxBefore);
  });

  it("answers a wrong token exactly as an unknown reference, revealing nothing", async () => {
    const { quoteRequests, confirmation } = await submitWithdrawableQuote();

    const wrongToken = await messageOf(quoteRequests.submissions.withdrawConsent(confirmation.publicReference, "not-the-token", withdrawalContext()));
    const unknownReference = await messageOf(quoteRequests.submissions.withdrawConsent("QR-2026-UNKNOWN", confirmation.verificationToken, withdrawalContext()));
    const unknownStatus = await messageOf(quoteRequests.submissions.status("QR-2026-UNKNOWN", confirmation.verificationToken));

    expect(wrongToken).toBe(unknownReference);
    expect(wrongToken).toBe(unknownStatus);
  });

  it("keeps the original grant as evidence: the record survives with its text reference and granted date", async () => {
    const { seed, quoteRequests, confirmation, quote } = await submitWithdrawableQuote();
    const before = await seed.app.consent.service.findRecord(quote.consentRecordId);
    expect(before).toBeDefined();

    await quoteRequests.submissions.withdrawConsent(confirmation.publicReference, confirmation.verificationToken, withdrawalContext());

    const after = await seed.app.consent.service.findRecord(quote.consentRecordId);
    expect(after).toBeDefined();
    expect(after?.id).toBe(quote.consentRecordId);
    expect(after?.consentTextId).toBe(seed.consentTextId);
    expect(after?.grantedAt).toBe(before?.grantedAt);
    expect(after?.purpose).toBe("lead_transmission");
    expect(after?.intendedRecipient).toBe(before?.intendedRecipient);
    expect((await seed.app.consent.service.searchRecords(superAdminActor)).some((record) => record.id === quote.consentRecordId)).toBe(true);
  });

  it("still withdraws and cancels when closing the assignment fails", async () => {
    const { seed, quoteRequests, confirmation, quote } = await submitWithdrawableQuote({
      assignments: (seeded) => ({
        list: () => seeded.app.leads.assignments.list(),
        updateStatus: async () => {
          throw new Error("assignment store unavailable");
        }
      })
    });

    const result = await quoteRequests.submissions.withdrawConsent(confirmation.publicReference, confirmation.verificationToken, withdrawalContext());

    expect(result.alreadyWithdrawn).toBe(false);
    expect((await seed.app.consent.service.findRecord(quote.consentRecordId))?.status).toBe("withdrawn");
    expect((await quoteRequests.submissions.findById(quote.id))?.status).toBe("cancelled");
    expect(actionCount(seed, "quote_request.cancelled_by_visitor")).toBe(1);

    const failure = seed.app.audit.writer.all().find((entry) => entry.action === "lead_assignment.closed_consent_withdrawn" && entry.result === "failed");
    expect(failure?.reason).toBe("assignment_close_failed");
    // The partner is still told to stop working the lead even though the status update failed.
    expect((await seed.app.notifications.dispatch.listInApp(seed.partnerTenantId)).some((notification) => notification.type === "lead_consent_withdrawn")).toBe(true);
  });

  it("rate limits the withdrawal endpoint at five calls per hour and IP", async () => {
    const { quoteRequests, confirmation } = await submitWithdrawableQuote();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await quoteRequests.submissions.withdrawConsent(confirmation.publicReference, confirmation.verificationToken, withdrawalContext());
    }

    await expect(quoteRequests.submissions.withdrawConsent(confirmation.publicReference, confirmation.verificationToken, withdrawalContext()))
      .rejects.toThrow("Rate limit exceeded for public submissions");
    await expect(quoteRequests.submissions.withdrawConsent(confirmation.publicReference, confirmation.verificationToken, withdrawalContext("203.0.113.99")))
      .resolves.toMatchObject({ alreadyWithdrawn: true });
  });
});
