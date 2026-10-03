import { expect, test } from "@playwright/test";
import { messagesJson, messagesText, publicFile, publicPage, readSources } from "./helpers/public-sources";
import { routing } from "../i18n/routing";

/** Spec 061 FR-005: opt-out of the satisfaction survey from the e-mail link (FR/EN, no account). */

const page = publicPage("unsubscribe/page.tsx");
const form = publicFile("components/tracking/unsubscribe-form.tsx");
const api = publicFile("lib/public-api.ts");

test("the unsubscribe route is localised and never indexed", () => {
  expect(routing.pathnames["/unsubscribe"]).toEqual({ fr: "/desinscription", en: "/unsubscribe" });
  const source = readSources([page]);
  expect(source).toContain("noindex: true");
  expect(source).toContain('referrer: "no-referrer"');
  const config = readSources(["apps/public/next.config.ts"]);
  for (const path of ["/desinscription", "/en/unsubscribe"]) expect(config).toContain(`"${path}"`);
  const robots = readSources([publicFile("robots.ts")]);
  for (const path of ["/desinscription", "/en/unsubscribe"]) expect(robots).toContain(`"${path}"`);
});

test("opening the link changes nothing: the visitor confirms, then the API is called with the token", () => {
  const source = readSources([page, form]);
  expect(source).toContain("TOKEN_PATTERN.test(tokenParam)");
  expect(source).toContain("<UnsubscribeForm token={token} labels={labels} />");
  expect(source).toContain('data-form="unsubscribe"');
  expect(source).toContain("onSubmit={handleSubmit}");
  const lib = readSources([api]);
  expect(lib).toContain("export async function unsubscribeFromSurveys");
  expect(lib).toContain("/notifications/unsubscribe");
  expect(lib).toContain('method: "POST"');
});

test("the copy exists in both locales and avoids forbidden wording", () => {
  for (const locale of ["fr", "en"] as const) {
    const namespace = messagesJson(locale).Unsubscribe as Record<string, string>;
    for (const key of ["title", "lead", "confirm", "successTitle", "successBody", "unavailableTitle", "unavailableBody", "error"]) {
      expect(namespace[key], `${locale}.${key}`).toBeTruthy();
    }
  }
  const catalogue = ["fr", "en"].map((locale) => messagesText(locale as "fr" | "en", "Unsubscribe")).join("\n").toLowerCase();
  const sources = readSources([page, form]).toLowerCase();
  for (const forbidden of ["acheter maintenant", "souscrire maintenant", "contrat valide", "garantie acceptée", "buy now", "subscribe now"]) {
    expect(catalogue).not.toContain(forbidden);
    expect(sources).not.toContain(forbidden);
  }
  expect(sources).not.toMatch(/apps\/(admin|broker|backoffice)|@assurmatch\/(admin|broker)/);
});
