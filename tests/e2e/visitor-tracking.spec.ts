import { expect, test } from "@playwright/test";
import { e2eEnv } from "./support/env";
import { loadJourneyState, requireState } from "./support/journey-state";
import { extractLink, messageIdsTo, searchMessages, waitForMail } from "./support/mailpit";
import { escapeRegExp } from "./support/ui";

// Spec 059 / PRD D-3 (spec 054): the visitor has no account. Their tracking space is reached by a
// personal magic link, re-sendable from /suivi, and the feedback page never leaks anything without
// a valid link. Public project: one visitor context, never a back-office session.

test.describe.configure({ mode: "serial" });

test("lien magique : il ouvre l'espace de suivi ; un jeton altéré ne montre rien", async ({ page }) => {
  const state = loadJourneyState();
  const trackingLink = requireState(state, "trackingLink");
  const quoteReference = requireState(state, "quoteReference");
  const partnerName = requireState(state, "partnerName");

  await page.goto(trackingLink);
  await expect(page.getByText(quoteReference).first()).toBeVisible();
  await expect(page.getByText(partnerName).first()).toBeVisible();
  await expect(page.getByText(/Ce lien de suivi est personnel/u)).toBeVisible();

  const tampered = new URL(trackingLink);
  tampered.searchParams.set("token", `${tampered.searchParams.get("token")?.slice(0, -4) ?? ""}AAAA`);
  await page.goto(tampered.toString());
  await expect(page.getByText(partnerName)).toHaveCount(0);
  await expect(page.getByText("Message du courtier")).toHaveCount(0);
});

test("renvoi depuis /suivi : réponse neutre, nouvel e-mail seulement pour le bon couple référence + e-mail", async ({ page }) => {
  const state = loadJourneyState();
  const quoteReference = requireState(state, "quoteReference");
  const visitorEmail = requireState(state, "visitorEmail");
  const strangerEmail = `inconnu.${Date.now()}@visitor.e2e.test`;

  // Wrong e-mail: the same neutral answer, and nothing is sent to anyone.
  await page.goto("/suivi");
  await page.locator("#tracking-reference").fill(quoteReference);
  await page.locator("#tracking-email").fill(strangerEmail);
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
  const neutral = page.getByRole("status").filter({ hasText: /lien/iu }).first();
  await expect(neutral).toBeVisible();
  const neutralText = (await neutral.textContent())?.replace(/\s+/gu, " ").trim() ?? "";

  // Right pair: same wording on screen, and a NEW working link by e-mail.
  const seen = await messageIdsTo(visitorEmail);
  await page.goto("/suivi");
  await page.locator("#tracking-reference").fill(quoteReference);
  await page.locator("#tracking-email").fill(visitorEmail);
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
  const answer = page.getByRole("status").filter({ hasText: /lien/iu }).first();
  await expect(answer).toBeVisible();
  expect((await answer.textContent())?.replace(/\s+/gu, " ").trim(), "same neutral answer for a right and a wrong e-mail").toBe(neutralText);

  const mail = await waitForMail({ to: visitorEmail, exclude: seen, body: new RegExp(quoteReference, "u") });
  const link = extractLink(mail, new RegExp(`^${escapeRegExp(e2eEnv.publicUrl)}/demandes-de-devis/${quoteReference}\\?token=`, "u"));
  expect(link).not.toBe(state.trackingLink);
  await page.goto(link);
  await expect(page.getByText(quoteReference).first()).toBeVisible();
  expect(await searchMessages(`to:"${strangerEmail}"`)).toHaveLength(0);
});

test("page d'avis : sans lien valide, réponse neutre et aucune donnée de la demande", async ({ page }) => {
  const state = loadJourneyState();
  const quoteReference = requireState(state, "quoteReference");
  const partnerName = requireState(state, "partnerName");
  await page.goto(`/avis/${quoteReference}`);
  await expect(page.getByText("Ce questionnaire n'est plus disponible")).toBeVisible();
  await expect(page.getByText(partnerName)).toHaveCount(0);
  await page.goto(`/avis/${quoteReference}?token=invalid-token-e2e`);
  await expect(page.getByText("Ce questionnaire n'est plus disponible")).toBeVisible();
});
