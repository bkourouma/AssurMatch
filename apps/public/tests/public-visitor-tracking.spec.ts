import { expect, test } from "@playwright/test";
import { messagesJson, messagesText, publicFile, publicPage, readSources } from "./helpers/public-sources";
import { routing } from "../i18n/routing";

/** Spec 054: visitor tracking space, tracking-link resend and satisfaction survey (T010-T013). */

const trackingPage = publicPage("quote-requests/[publicReference]/page.tsx");
const trackPage = publicPage("track/page.tsx");
const feedbackPage = publicPage("feedback/[publicReference]/page.tsx");
const trackForm = publicFile("components/tracking/tracking-link-form.tsx");
const surveyForm = publicFile("components/tracking/satisfaction-survey-form.tsx");
const proposalsSlot = publicFile("components/tracking/quote-proposals-slot.tsx");
const api = publicFile("lib/public-api.ts");

test("the tracking space reads the public status API with the token, server-side and uncached", () => {
  const page = readSources([trackingPage]);
  const lib = readSources([api]);

  expect(page).toContain("getPublicQuoteStatus(publicReference, token)");
  expect(page).toContain("listQuoteDocuments(publicReference, token)");
  expect(lib).toContain("export async function getPublicQuoteStatus");
  expect(lib).toMatch(/\/quote-requests\/\$\{encodeURIComponent\(publicReference\)\}\?\$\{params\.toString\(\)\}`, \{ cache: "no-store" \}/);
  // Every refusal of the API is the same neutral 404.
  expect(lib).toContain('response.status === 404');
  expect(lib).toContain('{ status: "denied" }');

  // Status headline, brokers, timeline, technical role, expiry hint, documents and withdrawal.
  for (const marker of ["status.${status}.headline", "brokers.status.", "timeline.steps.", 't("role")', 't("expiry"', "QuoteDocumentUpload", "<ConsentWithdrawal", "IndicativeOfferNotice"]) {
    expect(page).toContain(marker);
  }
  // A missing token or a refusal leads to the neutral message and the tracking-link page.
  expect(page).toContain('t("access.title")');
  expect(page).toContain('href="/track"');
  // Never renders the form answers.
  expect(page).not.toMatch(/\.answers\b|formAnswers|answerValues/);
  // The proposals slot (spec 055) renders only when the view carries proposals.
  expect(page).toContain("<QuoteProposalsSlot");
  expect(readSources([proposalsSlot])).toContain("if (!proposals || proposals.length === 0) return null;");
});

test("every public quote status, broker status and timeline step has FR and EN copy", () => {
  for (const locale of ["fr", "en"] as const) {
    const quoteRequest = messagesJson(locale).QuoteRequest as Record<string, Record<string, unknown>>;
    for (const status of ["received", "in_review", "transmitted", "in_progress", "proposal_available", "closed", "not_transmitted"]) {
      const entry = (quoteRequest.status as Record<string, { headline?: string; body?: string }>)[status];
      expect(entry?.headline, `${locale} ${status}`).toBeTruthy();
      expect(entry?.body, `${locale} ${status}`).toBeTruthy();
    }
    const brokerStatus = (quoteRequest.brokers as { status: Record<string, string> }).status;
    for (const status of ["transmitted", "in_progress", "proposal_available", "closed"]) expect(brokerStatus[status]).toBeTruthy();
    const steps = (quoteRequest.timeline as { steps: Record<string, string> }).steps;
    for (const step of ["received", "in_review", "transmitted", "accepted", "reassigned", "closed", "consent_withdrawn", "not_transmitted"]) {
      expect(steps[step]).toBeTruthy();
    }
  }
});

test("the tracking-link page is neutral and carries a honeypot", () => {
  const form = readSources([trackForm]);
  const page = readSources([trackPage]);
  const lib = readSources([api]);

  expect(lib).toContain("/quote-requests/tracking-link");
  expect(form).toContain("requestTrackingLink(");
  expect(form).toContain('name="website"');
  expect(form).toContain("tabIndex={-1}");
  // Accepted and malformed answers both end on the same neutral confirmation; 429 is polite.
  expect(form).toContain('if (result === "accepted" || result === "invalid") setStatus("confirmed");');
  expect(form).toContain("labels.rateLimited");
  expect(page).toContain("noindex: true");

  expect(messagesText("fr", "Tracking")).toContain("Si cette référence correspond à cette adresse e-mail");
  expect(messagesText("en", "Tracking")).toContain("If this reference matches this e-mail address");
});

test("the feedback page loads the survey with its token and shows one neutral refusal", () => {
  const page = readSources([feedbackPage]);
  const form = readSources([surveyForm]);
  const lib = readSources([api]);

  expect(page).toContain("getSatisfactionSurvey(publicReference, token)");
  expect(page).toContain('t("unavailableBody")');
  expect(page).toContain("noindex: true");
  expect(lib).toContain("/satisfaction-surveys/");
  expect(form).toContain('name="rating"');
  expect(form).toContain('name="comment"');
  expect(form).toContain('name="flaggedConcern"');
  expect(form).toContain("submitSatisfactionSurvey(");
});

test("tracking, track and feedback routes are localised", () => {
  expect(routing.pathnames["/quote-requests/[publicReference]"]).toEqual({ fr: "/demandes-de-devis/[publicReference]", en: "/quote-requests/[publicReference]" });
  expect(routing.pathnames["/track"]).toEqual({ fr: "/suivi", en: "/track" });
  expect(routing.pathnames["/feedback/[publicReference]"]).toEqual({ fr: "/avis/[publicReference]", en: "/feedback/[publicReference]" });
});

test("token pages send no referrer, are never indexed and are disallowed in robots.txt", () => {
  const config = readSources(["apps/public/next.config.ts"]);
  const robots = readSources([publicFile("robots.ts")]);

  expect(config).toContain('{ key: "Referrer-Policy", value: "no-referrer" }');
  expect(config).toContain('{ key: "X-Robots-Tag", value: "noindex, nofollow" }');
  expect(config).toContain("async headers()");
  for (const path of ["/demandes-de-devis/:publicReference*", "/en/quote-requests/:publicReference*", "/suivi", "/en/track", "/avis/:publicReference*", "/en/feedback/:publicReference*"]) {
    expect(config).toContain(`"${path}"`);
  }
  for (const path of ["/demandes-de-devis/", "/en/quote-requests/", "/avis/", "/en/feedback/", "/suivi", "/en/track"]) {
    expect(robots).toContain(`"${path}"`);
  }
  for (const page of [trackingPage, trackPage, feedbackPage]) {
    const source = readSources([page]);
    expect(source).toContain("noindex: true");
    expect(source).toContain('referrer: "no-referrer"');
  }
});

test("visitor tracking surfaces avoid forbidden wording and back-office imports", () => {
  const sources = readSources([trackingPage, trackPage, feedbackPage, trackForm, surveyForm, proposalsSlot]);
  const catalogue = ["fr", "en"]
    .flatMap((locale) => ["QuoteRequest", "Tracking", "Feedback"].map((ns) => messagesText(locale as "fr" | "en", ns)))
    .join("\n")
    .toLowerCase();
  for (const forbidden of ["acheter maintenant", "souscrire maintenant", "contrat valide", "garantie acceptée", "la meilleure assurance du marché", "buy now", "subscribe now"]) {
    expect(catalogue).not.toContain(forbidden);
    expect(sources.toLowerCase()).not.toContain(forbidden);
  }
  expect(sources).not.toMatch(/apps\/(admin|broker|backoffice)|@assurmatch\/(admin|broker)/);
});
