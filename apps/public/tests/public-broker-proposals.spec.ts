import { expect, test } from "@playwright/test";
import { messagesJson, publicFile, publicPage, readSources } from "./helpers/public-sources";

/** Spec 055 T016: broker proposals and the visitor's follow-up on the tracking space (US2, US3). */

const trackingPage = publicPage("quote-requests/[publicReference]/page.tsx");
const card = publicFile("components/tracking/quote-proposal-card.tsx");
const form = publicFile("components/tracking/proposal-response-form.tsx");
const slot = publicFile("components/tracking/quote-proposals-slot.tsx");
const documentRoute = publicFile("api/quote-requests/[publicReference]/proposals/[proposalId]/document/route.ts");
const api = publicFile("lib/public-api.ts");

type Messages = Record<string, unknown>;

function proposalsCatalogue(locale: "fr" | "en"): Messages {
  return (messagesJson(locale).QuoteRequest as Messages).proposals as Messages;
}

function leaves(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(leaves);
  return [];
}

test("the tracking page renders every proposal of the view inside the proposals slot", () => {
  const page = readSources([trackingPage]);
  expect(page).toContain("<QuoteProposalsSlot");
  expect(page).toContain("<QuoteProposalCard");
  expect(page).toContain("proposals.map((proposal)");
  // Nothing is shown after a consent withdrawal, and the API order (newest first) is kept.
  expect(page).toContain("view.consent.withdrawn\n    ? []");
  expect(page).not.toMatch(/proposals\.sort|\.sort\(\(left, right\) => .*price/);
  expect(readSources([slot])).toContain("if (!proposals || proposals.length === 0) return null;");
});

test("a proposal shows the broker, plain-text message, indicative price, guarantees, validity, status and the notice", () => {
  const source = readSources([card]);
  const page = readSources([trackingPage]);
  for (const marker of ["proposal.nonContractualNotice", "proposal.message", "proposal.guarantees.map", "labels.validUntil", "labels.status[status]", "<Badge", 'tone="indicative"']) {
    expect(source).toContain(marker);
  }
  // Plain text only: the broker message is never injected as HTML.
  expect(source).not.toContain("dangerouslySetInnerHTML");
  // Price with currency, single amount or range.
  expect(page).toContain('style: "currency", currency');
  for (const key of ["proposals.priceRange", "proposals.priceFrom", "proposals.priceUpTo", "proposals.from", "proposals.validUntil"]) {
    expect(page).toContain(key);
  }
  // The licence green never marks a proposal status.
  expect(source).not.toContain('"approved"');
});

test("the visitor answers with one of three actions and the contract payload fields", () => {
  const source = readSources([form]);
  const lib = readSources([api]);
  expect(source).toContain('["interested", "declined", "question"]');
  for (const field of ['name="callbackSlot"', 'name="declineReason"', 'name="question"', "VISITOR_DECLINE_REASONS.map", "maxLength={VISITOR_RESPONSE_QUESTION_MAX}", "maxLength={VISITOR_RESPONSE_CALLBACK_SLOT_MAX}"]) {
    expect(source).toContain(field);
  }
  for (const field of ["body.callbackSlot = callbackSlot", "body.declineReason = reason", "body.question = question"]) {
    expect(source).toContain(field);
  }
  expect(source).toContain("respondToProposal(publicReference, proposalId, token, body)");
  expect(lib).toContain("/proposals/${encodeURIComponent(proposalId)}/responses?${params.toString()}");
  // 409 and 429 are polite, distinct outcomes.
  expect(lib).toContain('if (response.status === 409) return { status: "not_respondable" };');
  expect(lib).toContain('if (response.status === 429) return { status: "rate_limited" };');
  expect(source).toContain("labels.notRespondable");
  expect(source).toContain("labels.rateLimited");
  // The form only appears while the proposal can be answered; the last answer is shown.
  const cardSource = readSources([card]);
  expect(cardSource).toContain("proposal.canRespond ?");
  expect(cardSource).toContain("proposal.visitorResponse ?");
});

test("the proposal PDF is proxied server-side with the token, uncached and neutral on refusal", () => {
  const route = readSources([documentRoute]);
  const lib = readSources([api]);
  const cardSource = readSources([card]);
  expect(route).toContain("export async function GET(");
  expect(route).toContain("fetchProposalDocument(publicReference, proposalId, token)");
  expect(route).toContain('"Cache-Control": "no-store"');
  expect(route).toContain('"X-Content-Type-Options": "nosniff"');
  expect(route).toContain('"Referrer-Policy": "no-referrer"');
  expect(route).toContain("return neutral(404)");
  expect(route).toContain('"Content-Type": "application/pdf"');
  expect(lib).toContain("/proposals/${encodeURIComponent(proposalId)}/document?${params.toString()}");
  expect(lib).toContain("export function proposalDocumentHref");
  expect(cardSource).toContain("proposal.hasDocument ?");
  expect(cardSource).toContain("proposalDocumentHref(publicReference, proposal.id, token)");
  expect(cardSource).toContain('rel="noreferrer nofollow"');
});

test("proposal copy exists in FR and EN with identical keys and says the broker will get back", () => {
  const fr = proposalsCatalogue("fr");
  const en = proposalsCatalogue("en");
  const keys = (value: unknown, prefix = ""): string[] =>
    value && typeof value === "object"
      ? Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key))
      : [prefix];
  expect(keys(fr).sort()).toEqual(keys(en).sort());
  const response = fr.response as Record<string, string>;
  expect(response.interested).toBe("Je suis intéressé, rappelez-moi");
  expect(response.declined).toBe("Je ne donne pas suite");
  expect(response.question).toBe("Poser une question");
  expect(response.recordedInterested).toContain("Le courtier vous recontactera");
});

test("proposal surfaces never use contract, purchase or acceptance wording and import no back-office code", () => {
  const catalogue = [...leaves(proposalsCatalogue("fr")), ...leaves(proposalsCatalogue("en"))].join("\n").toLowerCase();
  const sources = readSources([card, form, documentRoute]).toLowerCase();
  for (const forbidden of ["accepter le contrat", "souscrire", "contrat valide", "garantie acceptée", "acheter", "subscribe", "buy now", "accept the contract", "valid contract"]) {
    expect(catalogue).not.toContain(forbidden);
    expect(sources).not.toContain(forbidden);
  }
  expect(readSources([trackingPage, card, form, documentRoute, api])).not.toMatch(/apps\/(admin|broker|backoffice)|@assurmatch\/(admin|broker)/);
});
