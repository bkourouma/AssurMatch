import { expect, test } from "@playwright/test";
import { messagesText, publicFile, publicPage, readSources } from "./helpers/public-sources";

test("the pricing page lists the seven billable-lead criteria and reads the plan prices", () => {
  const page = readSources([publicPage("brokers/pricing/page.tsx")]);
  const content = readSources([publicFile("content/brokers.ts")]);

  // Structural: the page reads the criteria and the live plan prices, never invented numbers.
  expect(page).toContain("billableLeadCriteria(locale)");
  expect(page).toContain("BillableCriteriaList");
  expect(page).toContain("listPartnerPlans");
  expect(page).toContain("PlanPricingCard");
  expect(page).toContain('t("pricing.onRequest")');

  // Exactly the seven criteria of `billableLeadCriteriaSchema` (packages/shared/contracts/billing.contracts.ts).
  const criteria = [
    "contact_reachable",
    "country_active",
    "product_active",
    "consent_collected",
    "not_duplicate",
    "broker_assigned",
    "minimum_information_complete"
  ];
  for (const id of criteria) {
    expect(content).toContain(`id: "${id}"`);
  }
  expect((content.match(/id: "(contact_reachable|country_active|product_active|consent_collected|not_duplicate|broker_assigned|minimum_information_complete)"/g) ?? []).length).toBe(criteria.length * 2);
});

test("the application form has the honeypot, an unchecked consent box and no file input", () => {
  const form = readSources([publicFile("components/forms/partner-application-form.tsx")]);

  // Honeypot: hidden from people and assistive technology, filled only by robots.
  expect(form).toContain('name="website"');
  expect(form).toContain("am-visually-hidden");
  // Consent is a plain, unticked checkbox: never `defaultChecked`, never `checked`.
  expect(form).toContain('name="consent"');
  expect(form).not.toMatch(/name="consent"[^>]*(defaultChecked|checked)/);
  // Document upload is explicitly out of scope for this release (spec 045 D5).
  expect(form).not.toContain('type="file"');
});

test("the application form is rendered with a no-JavaScript server action", () => {
  const page = readSources([publicPage("brokers/apply/page.tsx")]);
  const form = readSources([publicFile("components/forms/partner-application-form.tsx")]);

  // Structural: `brokers/apply/page.tsx` defines an inline server action (spec 050 D6) and binds it to
  // the client form's `formAction` prop, so a visitor without JavaScript still posts through it instead
  // of a GET that would put their name, e-mail, phone and licence number in the URL.
  expect(page).toContain('"use server"');
  expect(page).toContain("async function submitApplicationAction");
  expect(page).toContain("formAction={boundSubmitApplicationAction}");

  // The client component forwards that action onto the actual `<form>` element and keeps every field
  // name the action reads: with JavaScript, `onSubmit`'s `preventDefault()` still owns the interaction.
  expect(form).toContain("formAction");
  expect(form).toContain("{...(formAction ? { action: formAction } : {})}");
  expect(form).toContain("event.preventDefault()");
});

test("the application confirmation page exists, is noindex and reads only the public reference from the URL", () => {
  const page = readSources([publicPage("brokers/apply/confirmation/page.tsx")]);

  // Structural: the page exists and asks for `noindex` (spec 050 D7 - a URL carrying someone else's
  // reference is not one search engines should list).
  expect(page).toContain("noindex: true");

  // It reads a `reference` query parameter and nothing else that could carry personal data: no name,
  // e-mail, phone or company field is ever read from `searchParams`.
  expect(page).toContain("query.reference");
  expect(page).not.toMatch(/query\.(name|email|phone|legalName|contactName|contactEmail|contactPhone)/i);
  expect(page).not.toContain("contactEmail");
  expect(page).not.toContain("contactPhone");
  expect(page).not.toContain("legalName");
});

test("the login page composes the portal URL from the environment and never writes a back-office route literal", () => {
  const page = readSources([publicPage("brokers/login/page.tsx")]);
  const siteConfig = readSources([publicFile("lib/site-config.ts")]);

  expect(page).toContain("brokerLoginUrl");
  expect(page).not.toContain('"/broker/');
  expect(page).not.toContain('"/admin/');

  expect(siteConfig).toContain("NEXT_PUBLIC_ASSURMATCH_BROKER_URL");
  expect(siteConfig).toContain("export const brokerLoginUrl");

  // Copy: the MFA notice and the lost-access contact link now live in the French catalogue.
  const fr = messagesText("fr", "BrokerLogin");
  expect(fr).toContain("authentification multifacteur");
});
