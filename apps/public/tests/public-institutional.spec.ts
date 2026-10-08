import { expect, test } from "@playwright/test";
import { publicFile, publicPage, readSources } from "./helpers/public-sources";

test("the how-it-works page states what AssurMatch does not do", () => {
  const page = readSources([publicPage("how-it-works/page.tsx")]);
  const content = readSources([publicFile("content/institutional.ts")]);

  // Structural: the page renders the editorial "not done" section.
  expect(page).toContain("content.notDone");
  expect(page).toContain("getHowItWorksContent");

  // Copy: the "AssurMatch does not do" statements themselves, in French.
  expect(content).toContain("Ce qu'AssurMatch ne fait pas");
  expect(content).toContain("ne vend pas d'assurance");
  expect(content).toContain("n'émet aucun contrat ni attestation");
  expect(content).toContain("ne collecte aucune prime");
  expect(content).toContain("ne donne aucun conseil personnalisé engageant");
});

test("the regulatory status page covers remuneration, ranking and sponsored offers and keeps its stable anchors", () => {
  const page = readSources([publicPage("regulatory-status/page.tsx")]);
  const content = readSources([publicFile("content/institutional.ts")]);

  // Structural: the page renders each section of the editorial content.
  expect(page).toContain("content.remuneration");
  expect(page).toContain("content.ranking");
  expect(page).toContain("content.sponsoredOffers");
  expect(page).toContain("content.indicativePrice");
  expect(page).toContain("getRegulatoryStatusContent");

  // The anchors are stable identifiers other pages and external links may depend on.
  expect(content).toContain('id: "remuneration"');
  expect(content).toContain('id: "classement"');
  expect(content).toContain('id: "offres-sponsorisees"');
  expect(content).toContain('id: "prix-indicatif"');

  // Copy: the remuneration model, the ranking rule and the sponsorship rule, in French.
  expect(content).toContain("AssurMatch est rémunéré par les courtiers partenaires, jamais par le visiteur");
  expect(content).toContain("Une offre sponsorisée ne peut jamais occuper la première position du classement du seul fait d'être sponsorisée");
  // The "how to verify" passage must not claim that changing the sort always changes the first offer.
  expect(content).not.toContain("la première offre change");
  expect(content).not.toContain("the first offer changes");
  expect(content).toContain("Une offre sponsorisée porte toujours un badge orange visible");
});

test("the commitment page exists and reads the Commitment namespace", () => {
  const page = readSources([publicPage("our-commitment/page.tsx")]);

  expect(page).toContain('namespace: "Commitment"');
  expect(page).toContain('getTranslations("Commitment")');
  expect(page).toContain("getCommitmentContent");
  expect(page).toContain("export async function generateMetadata");
});

test("the four legal pages and their country variants call getLegalPage", () => {
  const globalPages = readSources([
    publicPage("legal-notice/page.tsx"),
    publicPage("privacy/page.tsx"),
    publicPage("cookies/page.tsx"),
    publicPage("terms/page.tsx")
  ]);
  const countryPages = readSources([
    publicPage("countries/[countryCode]/legal-notice/page.tsx"),
    publicPage("countries/[countryCode]/privacy/page.tsx"),
    publicPage("countries/[countryCode]/cookies/page.tsx"),
    publicPage("countries/[countryCode]/terms/page.tsx")
  ]);

  for (const slug of ["legal-notice", "privacy", "cookies", "terms"]) {
    expect(globalPages).toContain(`const SLUG = "${slug}" as const`);
  }
  // Every one of the eight pages resolves its content through the single legal content seam.
  expect((globalPages.match(/getLegalPage\(/g) ?? []).length).toBeGreaterThanOrEqual(8);
  expect((countryPages.match(/getLegalPage\(/g) ?? []).length).toBeGreaterThanOrEqual(8);
  // Country variants also merge in any country-specific override rather than always showing the global page.
  expect(countryPages).toContain("hasCountryLegalOverride");
});

test("the contact form is rendered with a no-JavaScript server action", () => {
  const page = readSources([publicPage("contact/page.tsx")]);
  const form = readSources([publicFile("components/forms/contact-form.tsx")]);

  // Structural: `contact/page.tsx` defines an inline server action (spec 050 D6) and binds it to the
  // client form's `formAction` prop, so a visitor without JavaScript still posts through it instead of
  // a GET that would put their name, e-mail and message in the URL.
  expect(page).toContain('"use server"');
  expect(page).toContain("async function submitContactAction");
  expect(page).toContain("formAction={boundSubmitContactAction}");

  // The client component forwards that action onto the actual `<form>` element and keeps every field
  // name the action reads: with JavaScript, `onSubmit`'s `preventDefault()` still owns the interaction.
  expect(form).toContain("formAction");
  expect(form).toContain("{...(formAction ? { action: formAction } : {})}");
  expect(form).toContain("event.preventDefault()");
});
