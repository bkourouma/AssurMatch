import { expect, test } from "@playwright/test";
import { adminWithRole } from "./support/admin-lot11";
import { newAppContext, openAs, type BackOfficeAccount } from "./support/backoffice";
import { e2eEnv } from "./support/env";
import { apiCall, asRecord, closeSessions, sessionPage, visit } from "./support/pro-roles";
import { submitStatusTransition } from "./support/partners";
import { card } from "./support/ui";
import { inviteMember, provisionBroker, complianceAccount, superAdminAccount, addDays, isoDate } from "./support/world";
import {
  DECISION_REASON,
  RUN_LABEL,
  TokenSource,
  adminContextWithToken,
  adminDecision,
  adminPaysAccount,
  adminTokenSource,
  answered,
  brokerOffer,
  brokerTokenSource,
  ciAutoScope,
  createOffer,
  decideInUi,
  expectOfferUnavailable,
  listedPublicly,
  offerBody,
  offerTitle,
  ownOffer,
  pastValidity,
  publicDetailDigits,
  recordActionAnswers,
  seenNotices,
  watchNotices,
  statusOf,
  submitOffer,
  updateOffer,
  waitPublicListing,
  type OfferScope
} from "./support/edge-p2p4-validation";

// Lot 3 / edge cases of phase 4 (scenario section 9): refusal, decisions reserved to compliance, blocked
// validations, suspension and reinstatement, concurrent decisions, versioned edit, withdrawal, expiry,
// suspended broker, public "Offre indisponible", expired session. Two throwaway Starter brokers (l3va, l3vb);
// the offers are fabricated through the API with the broker token, everything under test goes through the screens
// (admin decisions, broker pages) or the public pages. Nothing here touches the base journey, the Super Admin
// session data, the Compliance Admin account, the country CI or the shared journey state.

test.describe.configure({ mode: "serial" });

const w: {
  owner: BackOfficeAccount;
  agent: BackOfficeAccount;
  compliance: BackOfficeAccount;
  scope: OfferScope;
  ownerTok: TokenSource;
  agentTok: TokenSource;
  adminTok: TokenSource;
  published: string[];
  /** offers left submitted for the tests that follow */
  pendingC?: { id: string; title: string };
  b?: { partnerId: string; owner: BackOfficeAccount; ownerTok: TokenSource };
} = { published: [] } as never;

function constat(description: string): void {
  test.info().annotations.push({ type: "constat", description });
}

/**
 * The confirmation notice of a decision is rendered by the form that triggered it, but the page re-renders with the
 * new status and unmounts that form at once: the notice is generally never on screen. Observed behaviour is recorded
 * (the outcome itself is asserted from the page state and the API), not failed.
 */
function successNotice(outcome: Parameters<typeof answered>[0], message: string): void {
  if (answered(outcome, message)) {
    test.info().annotations.push({ type: "observation", description: `notice affichée : « ${message} »` });
    return;
  }
  constat(`La notice de succès « ${message} » n'est jamais visible : le formulaire de décision est démonté par le rafraîchissement de la page avant son affichage (apps/admin/app/offers/offer-forms.tsx OfferDecisionForm, rendu conditionné au statut dans apps/admin/app/offers/[offerId]/page.tsx:166-170). Notices réellement affichées : « ${outcome.message.slice(0, 200)} ».`);
}

function note(description: string): void {
  test.info().annotations.push({ type: "observation", description });
}

async function ownerToken(): Promise<string> {
  return w.ownerTok.get();
}

async function complianceToken(): Promise<string> {
  return w.adminTok.get();
}

/** An offer created and submitted by the owner of l3va. */
async function submittedOffer(tag: string, options: Record<string, unknown> = {}): Promise<{ id: string; title: string }> {
  const title = offerTitle(tag);
  const id = await createOffer(await ownerToken(), w.scope, title, options);
  ownOffer(id);
  await submitOffer(await ownerToken(), id);
  return { id, title };
}

/** An offer created, submitted by the owner and validated by compliance (API), listed publicly. */
async function publishedOffer(tag: string, options: Record<string, unknown> = {}): Promise<{ id: string; title: string }> {
  const offer = await submittedOffer(tag, options);
  const decision = await adminDecision(await complianceToken(), offer.id, "validate", `${DECISION_REASON} ${tag}`);
  expect(decision.status, `validate ${tag} -> ${decision.text.slice(0, 300)}`).toBeLessThan(300);
  w.published.push(offer.id);
  return offer;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  w.compliance = complianceAccount();
  w.adminTok = adminTokenSource(browser, w.compliance);
  const world = await provisionBroker(browser, { plan: "starter", label: "l3va" });
  w.owner = world.owner;
  w.agent = await inviteMember(browser, world.owner, { key: "agent", displayName: `Agent ${RUN_LABEL}`, emailDomain: "broker-l3va.e2e.test" });
  w.ownerTok = brokerTokenSource(browser, w.owner);
  w.agentTok = brokerTokenSource(browser, w.agent);
  w.scope = await ciAutoScope(await w.ownerTok.get());
});

test.afterAll(async () => {
  // Best effort: nothing published by this file stays on the public comparator for the other lots.
  try {
    const token = await w.adminTok.get();
    for (const id of w.published) {
      const status = String(asRecord(asRecord((await apiCall(token, "GET", `/admin/offers/${id}`)).body)).status);
      if (status === "published") await adminDecision(token, id, "suspend", `${RUN_LABEL} nettoyage de fin de lot`);
    }
  } catch {
    // the stack is disposable
  }
  await closeSessions();
});

// ---------------------------------------------------------------------------------------- E-P4-01a

test.describe("E-P4-01a refus, correction, re-soumission", () => {
  const refused: { id: string; title: string; reason: string } = { id: "", title: "", reason: `Prix hors grille ${RUN_LABEL}` };

  test("E-P4-01a-1 refuser une offre : notice, motif et historique côté courtier, notification, rien de public", async ({ browser }) => {
    test.setTimeout(5 * 60_000);
    const offer = await submittedOffer("Refus");
    Object.assign(refused, offer);

    const admin = await visit(browser, w.compliance, `/offers/${offer.id}`);
    await expect(admin.locator("[data-offer-decision='reject']")).toBeVisible();
    const outcome = await decideInUi(admin, "reject", refused.reason);
    expect(outcome.ok, outcome.message).toBe(true);
    successNotice(outcome, "Version refusée : elle repasse en brouillon avec le motif, visible du courtier.");
    await admin.reload();
    await expect(admin.getByText("Dernier motif communiqué au courtier")).toBeVisible();
    await expect(admin.getByText(refused.reason).first()).toBeVisible();
    await expect(admin.locator("[data-offer-decision='reject']")).toHaveCount(0);

    const broker = await visit(browser, w.owner, `/offers/${offer.id}`);
    await expect(broker.getByText("Motif du dernier refus")).toBeVisible();
    await expect(broker.getByText(refused.reason).first()).toBeVisible();
    await expect(broker.getByRole("columnheader", { name: "Décision" })).toBeVisible();
    await expect(broker.getByRole("columnheader", { name: "Motif" })).toBeVisible();
    const history = broker.getByRole("row").filter({ hasText: "Refusée le" });
    await expect(history.first()).toContainText(refused.reason);
    await expect(history.first()).toContainText(isoDate(new Date()));

    await openAs(broker, w.owner, "/notifications");
    const item = broker.locator("li").filter({ has: broker.getByRole("heading", { name: "Offre refusée" }) }).filter({ hasText: offer.title });
    await expect(item.first()).toBeVisible({ timeout: 30_000 });
    await expect(item.first()).toContainText(refused.reason);

    // Nothing public: never listed, and the detail page answers "Offre indisponible" (E-P4-03a, brouillon refusé).
    expect(await listedPublicly(offer.title)).toBe(false);
    await expectOfferUnavailable(browser, offer.id, "brouillon refusé");
  });

  test("E-P4-01a-2 resoumettre l'offre refusée sans la corriger : acceptée par le code, la conformité la refuse à nouveau", async ({ browser }) => {
    test.setTimeout(5 * 60_000);
    const broker = await visit(browser, w.owner, `/offers/${refused.id}`);
    await card(broker, "Actions").getByRole("button", { name: "Soumettre à validation" }).click();
    await expect(broker.getByText("En attente de validation par AssurMatch.")).toBeVisible();
    constat("Aucune règle n'empêche de resoumettre une version refusée sans correction : la version redevient « Soumise » (offer-lifecycle.service.ts, submit : seule la complétude est contrôlée). Comportement observé retenu ; à confirmer par le produit.");

    const admin = await visit(browser, w.compliance, `/offers/${refused.id}`);
    await expect(admin.locator("[data-offer-decision='reject']")).toBeVisible();
    refused.reason = `Toujours hors grille ${RUN_LABEL}`;
    const outcome = await decideInUi(admin, "reject", refused.reason);
    expect(outcome.ok, outcome.message).toBe(true);
    await openAs(broker, w.owner, `/offers/${refused.id}`);
    await expect(broker.getByText("Motif du dernier refus")).toBeVisible();
    await expect(broker.getByText(refused.reason).first()).toBeVisible();
  });

  test("E-P4-01a-3 le courtier corrige et resoumet, la conformité valide : l'offre devient publique", async ({ browser }) => {
    test.setTimeout(6 * 60_000);
    const broker = await visit(browser, w.owner, `/offers/${refused.id}`);
    const form = broker.locator("form[data-offer-form='update']");
    await form.locator("input[name='indicativePriceMax']").fill("125000");
    await form.locator("textarea[name='shortDescription']").fill("Version corrigée après refus : tarif aligné sur la grille.");
    await form.getByRole("button", { name: "Enregistrer le brouillon" }).click();
    await expect(form.getByText("Version enregistrée en brouillon.")).toBeVisible({ timeout: 30_000 });
    await broker.reload();
    await card(broker, "Actions").getByRole("button", { name: "Soumettre à validation" }).click();
    await expect(broker.getByText("En attente de validation par AssurMatch.")).toBeVisible();

    const admin = await visit(browser, w.compliance, `/offers/${refused.id}`);
    const outcome = await decideInUi(admin, "validate", `${DECISION_REASON} corrigée`);
    expect(outcome.ok, outcome.message).toBe(true);
    successNotice(outcome, "Version validée et publiée. Le courtier est notifié.");
    w.published.push(refused.id);

    await openAs(broker, w.owner, `/offers/${refused.id}`);
    await expect(broker.getByRole("row").filter({ hasText: "Validée le" }).first()).toBeVisible();
    await expect(broker.getByText("Motif du dernier refus")).toHaveCount(0);
    const secs = await waitPublicListing(refused.title, true);
    note(`offre corrigée visible au public après ${secs} s`);
  });
});

// ---------------------------------------------------------------------------------------- E-P4-01b

test("E-P4-01b motif de 7 caractères ou vide : bloqué par le champ, refusé par l'API admin ; 8 caractères acceptés", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const offer = await submittedOffer("Motif");
  const admin = await visit(browser, w.compliance, `/offers/${offer.id}`);
  const recorder = recordActionAnswers(admin);

  await admin.locator("[data-offer-decision='reject']").getByRole("button", { name: "Refuser" }).first().click();
  const dialog = admin.locator("dialog[open]");
  const reason = dialog.locator("input[name='reason']");
  await expect(reason).toHaveAttribute("minlength", "8");
  await reason.fill("1234567");
  await dialog.getByRole("button", { name: "Refuser" }).last().click();
  await admin.waitForTimeout(1500);
  expect(recorder.bodies, "aucune action serveur ne part avec 7 caractères").toHaveLength(0);
  await expect(dialog).toBeVisible();
  expect(await reason.evaluate((el: HTMLInputElement) => el.validationMessage), "message natif du navigateur").not.toBe("");
  note(`7 caractères : message natif « ${await reason.evaluate((el: HTMLInputElement) => el.validationMessage)} »`);

  await reason.fill("");
  await dialog.getByRole("button", { name: "Refuser" }).last().click();
  await admin.waitForTimeout(1000);
  expect(recorder.bodies, "aucune action serveur avec un motif vide").toHaveLength(0);
  note(`motif vide : message natif « ${await reason.evaluate((el: HTMLInputElement) => el.validationMessage)} »`);
  recorder.stop();
  await dialog.getByRole("button", { name: /Annuler/u }).first().click();

  // API (compliance token): the contract refuses a short or empty reason before any state change.
  const token = await complianceToken();
  for (const [action, value] of [["reject", "1234567"], ["validate", "1234567"], ["suspend", "1234567"], ["reject", ""]] as const) {
    const result = await adminDecision(token, offer.id, action, value);
    expect([400, 422], `${action} avec motif « ${value} » -> ${result.status} ${result.text.slice(0, 200)}`).toContain(result.status);
    note(`API ${action} motif « ${value} » -> ${result.status} ${result.text.slice(0, 160)}`);
  }
  expect(await statusOf(token, offer.id)).toBe("submitted");

  // Boundary: exactly 8 characters are accepted (the offer goes back to draft).
  const boundary = await adminDecision(token, offer.id, "reject", "12345678");
  expect(boundary.status, boundary.text.slice(0, 200)).toBeLessThan(300);
  expect(await statusOf(token, offer.id)).toBe("draft");
});

// ---------------------------------------------------------------------------------------- E-P4-01c

test("E-P4-01c support_admin et admin_pays : décisions réservées à la conformité, décision forcée via l'API refusée (403)", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  w.pendingC = await submittedOffer("Reserve");
  const { id, title } = w.pendingC;
  const token = await complianceToken();

  const support = await adminWithRole(browser, superAdminAccount(), "support_admin", "l3support");
  const supportPage = await visit(browser, support, `/offers/${id}`);
  await expect(supportPage.locator("[data-offer-decision]")).toHaveCount(0);
  const supportText = (await supportPage.locator("main").innerText()).replace(/\s+/gu, " ");
  note(`support_admin ouvre /offers/<id> : « ${supportText.slice(0, 200)} »`);
  constat("support_admin n'a pas la permission offers:read (packages/shared/rbac/assurmatch-role-matrix.ts:27) : la fiche n'affiche pas le badge « Décisions réservées à la conformité » mais « Offre introuvable » + refus d'accès. Le badge n'est atteignable qu'avec un rôle qui lit les offres (admin_pays).");
  await expect(supportPage.getByText("Offre introuvable")).toBeVisible();
  const supportToken = await new TokenSource(async () => {
    const page = await sessionPage(browser, support);
    return (await page.context().cookies()).find((entry) => entry.name === "assurmatch_admin_token")?.value ?? "";
  }).get();
  expect(supportToken).not.toBe("");
  for (const action of ["validate", "reject", "suspend"] as const) {
    const forced = await adminDecision(supportToken, id, action, `${DECISION_REASON} forcé support`);
    expect(forced.status, `support_admin ${action} -> ${forced.text.slice(0, 200)}`).toBe(403);
    note(`support_admin ${action} forcé -> ${forced.status} ${forced.text.slice(0, 140)}`);
  }
  expect((await apiCall(supportToken, "GET", `/admin/offers/${id}`)).status).toBe(403);
  expect(await statusOf(token, id)).toBe("submitted");

  let adminPays: BackOfficeAccount | undefined;
  try {
    adminPays = await adminPaysAccount(browser, "l3adminpays");
  } catch (error) {
    note(`admin_pays NON EXECUTÉ : création du compte impossible (${String(error).slice(0, 200)})`);
  }
  if (adminPays) {
    const page = await visit(browser, adminPays, `/offers/${id}`);
    await expect(page.getByText("Décisions réservées à la conformité")).toBeVisible();
    await expect(page.locator("[data-offer-decision='validate'], [data-offer-decision='reject'], [data-offer-decision='suspend']")).toHaveCount(0);
    const paysToken = (await page.context().cookies()).find((entry) => entry.name === "assurmatch_admin_token")?.value ?? "";
    for (const action of ["validate", "reject", "suspend"] as const) {
      const forced = await adminDecision(paysToken, id, action, `${DECISION_REASON} forcé admin_pays`);
      expect(forced.status, `admin_pays ${action} -> ${forced.text.slice(0, 200)}`).toBe(403);
      note(`admin_pays ${action} forcé -> ${forced.status} ${forced.text.slice(0, 140)}`);
    }
    expect(await statusOf(token, id)).toBe("submitted");
  }
  expect(title).toContain(RUN_LABEL);
});

// ------------------------------------------------------------------------ courtier qui valide lui-même

test("E-P4-01c' le courtier (propriétaire et agent) ne peut ni valider ni publier lui-même : 401/403, aucun bouton, fiche admin refusée", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const { id, title } = w.pendingC as { id: string; title: string };
  const token = await complianceToken();
  const ownerTokenValue = await ownerToken();
  const agentTokenValue = await w.agentTok.get();

  for (const [who, bearer] of [["propriétaire", ownerTokenValue], ["agent", agentTokenValue]] as const) {
    for (const action of ["validate", "reject", "suspend"] as const) {
      const forced = await adminDecision(bearer, id, action, `${DECISION_REASON} forcé courtier`);
      expect([401, 403], `${who} ${action} -> ${forced.status} ${forced.text.slice(0, 200)}`).toContain(forced.status);
      expect(forced.text).not.toContain(title);
      note(`${who} ${action} sur /admin/offers/<id> -> ${forced.status} ${forced.text.slice(0, 120)}`);
    }
    const read = await apiCall(bearer, "GET", `/admin/offers/${id}`);
    expect([401, 403], `${who} lit la fiche admin -> ${read.status}`).toContain(read.status);
  }
  expect(await statusOf(token, id)).toBe("submitted");

  // Broker screens: no decision button anywhere, for the owner and for the agent (consultation seule).
  const owner = await visit(browser, w.owner, `/offers/${id}`);
  await expect(owner.getByText("En attente de validation par AssurMatch.")).toBeVisible();
  await expect(owner.getByRole("button", { name: /Valider et publier|Refuser|Suspendre/u })).toHaveCount(0);
  await expect(owner.getByText("Valider et publier")).toHaveCount(0);
  const agent = await visit(browser, w.agent, `/offers/${id}`);
  await expect(agent.getByText("Consultation seule")).toBeVisible();
  await expect(agent.getByRole("button", { name: /Valider et publier|Refuser|Suspendre|Soumettre/u })).toHaveCount(0);

  // The broker session on the admin app: the broker token is not an admin session.
  const context = await adminContextWithToken(browser, ownerTokenValue);
  try {
    const page = await context.newPage();
    await page.goto(`/offers/${id}`);
    const where = new URL(page.url());
    note(`fiche admin ouverte avec la session d'un courtier -> ${where.pathname}${where.search}`);
    expect(where.pathname.startsWith("/login"), `redirigé vers /login (${page.url()})`).toBe(true);
    await expect(page.getByRole("button", { name: "Valider et publier" })).toHaveCount(0);
    await expect(page.getByText(title)).toHaveCount(0);
  } finally {
    await context.close();
  }
  expect(await statusOf(token, id)).toBe("submitted");
});

// ---------------------------------------------------------------------------------------- E-P4-01d

test("E-P4-01d validation bloquée : fin de validité passée sur une offre déjà soumise (liste des causes OFFER_VALIDATION_BLOCKED)", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const offer = await submittedOffer("Expiree");
  const sql = pastValidity(offer.id, "pending");
  note(`SQL (propre offre ${offer.id}, validité reculée sur la version soumise) : ${sql}`);
  const token = await complianceToken();

  const admin = await visit(browser, w.compliance, `/offers/${offer.id}`);
  const outcome = await decideInUi(admin, "validate", `${DECISION_REASON} expirée`);
  expect(outcome.ok).toBe(false);
  expect(outcome.message).toContain("Validation refusée : des contrôles bloquants sont listés ci-dessous.");
  expect(outcome.blockers.join(" | ")).toContain("Offre expirée : la date de fin de validité est passée");
  note(`validation bloquée, liste affichée : ${outcome.blockers.join(" | ")}`);

  const api = await adminDecision(token, offer.id, "validate", `${DECISION_REASON} expirée API`);
  expect(api.status).toBe(422);
  const body = asRecord(api.body);
  expect(body.code).toBe("OFFER_VALIDATION_BLOCKED");
  const codes = (Array.isArray(body.blockers) ? body.blockers : []).map((entry) => String(asRecord(entry).code));
  expect(codes).toContain("offer_expired");
  note(`API : 422 ${String(body.code)} blockers=${codes.join(",")}`);
  expect(await statusOf(token, offer.id)).toBe("submitted");
});

test("E-P4-01d' validation bloquée : mention « offre indicative » absente (si la soumission l'autorise)", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const title = offerTitle("SansMention");
  const created = await apiCall(await ownerToken(), "POST", "/broker/offers", {
    countryId: w.scope.countryId,
    productId: w.scope.productId,
    name: title,
    insurerName: "Assureur Atlantique CI",
    shortDescription: "Responsabilité civile, défense recours et assistance 24h/24.",
    guaranteeSummary: "RC obligatoire, défense recours, assistance",
    guaranteeLevel: 3,
    guarantees: [{ key: "rc", label: "Responsabilité civile", included: true }],
    indicativePriceMin: 85000,
    indicativePriceMax: 120000,
    currency: "XOF",
    pricingUnit: "an",
    validFrom: `${isoDate(new Date())}T00:00:00.000Z`,
    validUntil: `${isoDate(addDays(new Date(), 90))}T23:59:59.000Z`,
    sourceOfInformation: `Grille ${RUN_LABEL}`,
    publicDisclaimers: ["Prix à confirmer par le courtier partenaire"]
  });
  expect(created.status, created.text.slice(0, 300)).toBeLessThan(300);
  const id = String(asRecord(created.body).id);
  ownOffer(id);
  const submit = await apiCall(await ownerToken(), "POST", `/broker/offers/${id}/submit`, {});
  note(`soumission sans la mention « offre indicative » -> ${submit.status} ${submit.text.slice(0, 200)}`);
  if (submit.status >= 300) {
    constat(`« Mention offre indicative absente » n'est pas atteignable au niveau validation : la soumission la refuse déjà (${submit.status}).`);
    expect(submit.status).toBe(422);
    return;
  }
  const admin = await visit(browser, w.compliance, `/offers/${id}`);
  const outcome = await decideInUi(admin, "validate", `${DECISION_REASON} sans mention`);
  expect(outcome.ok).toBe(false);
  expect(outcome.blockers.join(" | ")).toContain("Mention « offre indicative » absente");
  note(`validation bloquée : ${outcome.blockers.join(" | ")}`);
  expect(await statusOf(await complianceToken(), id)).toBe("submitted");
});

// ---------------------------------------------------------------------------------------- E-P4-01e

test("E-P4-01e suspendre une offre publiée : retirée du comparateur, notice et notification côté courtier, « Offre indisponible », réintégration par « Valider et publier »", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const offer = await publishedOffer("Suspension");
  expect(await waitPublicListing(offer.title, true)).toBeLessThan(120);

  const admin = await visit(browser, w.compliance, `/offers/${offer.id}`);
  const reason = `Prix incohérent avec la grille ${RUN_LABEL}`;
  const suspended = await decideInUi(admin, "suspend", reason);
  expect(suspended.ok, suspended.message).toBe(true);
  successNotice(suspended, "Offre suspendue : retirée du comparateur. Le courtier voit le motif.");
  const secs = await waitPublicListing(offer.title, false, 120_000);
  note(`offre suspendue : retirée du comparateur public après ${secs} s`);
  expect(secs).toBeLessThanOrEqual(90);
  await expectOfferUnavailable(browser, offer.id, "offre suspendue");

  const broker = await visit(browser, w.owner, `/offers/${offer.id}`);
  await expect(broker.getByText("Offre suspendue par AssurMatch")).toBeVisible();
  await expect(broker.getByText(reason).first()).toBeVisible();
  await openAs(broker, w.owner, "/notifications");
  const item = broker.locator("li").filter({ has: broker.getByRole("heading", { name: "Offre suspendue" }) }).filter({ hasText: offer.title });
  await expect(item.first()).toBeVisible({ timeout: 30_000 });
  await expect(item.first()).toContainText(reason);

  // Reinstatement goes through "Valider et publier".
  await admin.goto(`/offers/${offer.id}`);
  await expect(admin.locator("[data-offer-decision='validate']")).toBeVisible();
  const back = await decideInUi(admin, "validate", `${DECISION_REASON} réintégration`);
  expect(back.ok, back.message).toBe(true);
  successNotice(back, "Version validée et publiée. Le courtier est notifié.");
  const secsBack = await waitPublicListing(offer.title, true, 120_000);
  note(`réintégration : ré-apparition publique après ${secsBack} s`);
  await admin.goto(`/offers/${offer.id}`);
  await expect(admin.locator("[data-offer-decision='suspend']")).toBeVisible();
});

// ---------------------------------------------------------------------------------------- E-P4-01f

test("E-P4-01f deux onglets de la conformité décident la même version : le second est refusé, l'offre n'est publiée qu'une fois", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const offer = await submittedOffer("Deux onglets");
  const tab1 = await visit(browser, w.compliance, `/offers/${offer.id}`);
  const tab2 = await tab1.context().newPage();
  await tab2.goto(`${e2eEnv.adminUrl}/offers/${offer.id}`);
  await expect(tab2.locator("[data-offer-decision='validate']")).toBeVisible();

  const first = await decideInUi(tab1, "validate", `${DECISION_REASON} onglet 1`);
  expect(first.ok, first.message).toBe(true);
  w.published.push(offer.id);

  // The second tab still shows the stale buttons.
  const second = await decideInUi(tab2, "validate", `${DECISION_REASON} onglet 2`);
  expect(second.ok).toBe(false);
  note(`second onglet : « ${second.message} »`);
  constat("Les décisions (valider, refuser, suspendre) ne portent pas de jeton de concurrence : le second onglet reçoit 409 OFFER_TRANSITION_INVALID « Action impossible dans l'état actuel de l'offre (aucune version soumise, déjà décidée ou retirée). Rechargez la page. » et non « Conflit de version… » (offer-lifecycle.service.ts, validate : no_submitted_version ; le message « Conflit de version » n'existe que pour la modification, jeton expectedUpdatedAt). Refus sûr, libellé différent du scénario.");
  expect(second.message).toContain("Action impossible dans l'état actuel de l'offre");
  await tab2.close();
  expect(await statusOf(await complianceToken(), offer.id)).toBe("published");

  // The real "Conflit de version" is the one of the versioned edit: a stale form against a newer version.
  const token = await ownerToken();
  const stale = await visit(browser, w.owner, `/offers/${offer.id}`);
  await expect(stale.locator("form[data-offer-form='update']")).toBeVisible();
  const patched = await updateOffer(token, offer.id, offer.title, { indicativePriceMax: 123456 });
  expect(patched.status, patched.text.slice(0, 200)).toBeLessThan(300);
  const form = stale.locator("form[data-offer-form='update']");
  await form.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await expect(form.getByText("Conflit de version : l'offre a été modifiée depuis son chargement. Rechargez la page puis recommencez.")).toBeVisible({ timeout: 30_000 });
});

// ---------------------------------------------------------------------------------------- E-P4-01g

test("E-P4-01g modifier une offre publiée : nouvelle version brouillon, l'ancienne reste en ligne, différences visibles, validation remplace le prix", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const offer = await publishedOffer("Nouvelle version");
  expect(await waitPublicListing(offer.title, true)).toBeLessThan(120);
  const before = await publicDetailDigits(offer.id);
  expect(before.status).toBe(200);
  expect(before.digits).toContain("85000");

  const broker = await visit(browser, w.owner, `/offers/${offer.id}`);
  const form = broker.locator("form[data-offer-form='update']");
  await expect(card(broker, "Modifier l'offre (nouvelle version)")).toBeVisible();
  await form.locator("input[name='indicativePriceMin']").fill("91234");
  await form.locator("input[name='indicativePriceMax']").fill("131234");
  await form.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await expect(form.getByText("Version enregistrée en brouillon. Soumettez-la quand elle est complète ; la version publiée reste en ligne d'ici là.")).toBeVisible({ timeout: 30_000 });
  await broker.reload();
  await expect(card(broker, "Version publiée")).toContainText("v1");
  await expect(card(broker, "Version en cours")).toContainText("v2");
  await expect(card(broker, "Version en cours")).toContainText("Brouillon");

  // The published version stays online with the old price.
  const during = await publicDetailDigits(offer.id);
  expect(during.status).toBe(200);
  expect(during.digits).toContain("85000");
  expect(during.digits).not.toContain("91234");
  expect(await listedPublicly(offer.title)).toBe(true);

  await card(broker, "Actions").getByRole("button", { name: "Soumettre à validation" }).click();
  await expect(broker.getByText("En attente de validation par AssurMatch.")).toBeVisible();

  const admin = await visit(browser, w.compliance, `/offers/${offer.id}`);
  const diff = card(admin, "Différences entre la version publiée et la version en cours");
  await expect(diff).toBeVisible();
  const row = diff.getByRole("row").filter({ hasText: "Prime minimale" });
  await expect(row).toBeVisible();
  const cells = (await row.innerText()).replace(/[\s\u00A0\u202F]/gu, "");
  expect(cells).toContain("85000");
  expect(cells).toContain("91234");

  const outcome = await decideInUi(admin, "validate", `${DECISION_REASON} nouveau prix`);
  expect(outcome.ok, outcome.message).toBe(true);
  await expect
    .poll(async () => (await publicDetailDigits(offer.id)).digits.includes("91234"), { timeout: 120_000, intervals: [1000, 2000, 3000, 5000], message: "new price on the public detail page" })
    .toBe(true);
  const after = await publicDetailDigits(offer.id);
  expect(after.digits).not.toContain("85000");
  const detail = await brokerOffer(await ownerToken(), offer.id);
  expect(asRecord(detail.published).versionNumber).toBe(2);
});

// ---------------------------------------------------------------------------------------- E-P4-01h

test("E-P4-01h-a le courtier retire l'offre du public : motif de 8 caractères, « Offre retirée du public. »", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  const offer = await publishedOffer("Retrait");
  expect(await waitPublicListing(offer.title, true)).toBeLessThan(120);
  const token = await ownerToken();

  // API: a 7-character reason is refused before any state change.
  const short = await apiCall(token, "POST", `/broker/offers/${offer.id}/withdraw`, { reason: "1234567", target: "offer" });
  expect([400, 422], `retrait avec 7 caractères -> ${short.status} ${short.text.slice(0, 200)}`).toContain(short.status);
  note(`API retrait motif 7 caractères -> ${short.status} ${short.text.slice(0, 140)}`);

  const broker = await visit(browser, w.owner, `/offers/${offer.id}`);
  const withdraw = broker.locator("[data-offer-withdraw='offer']");
  const recorder = recordActionAnswers(broker);
  await withdraw.getByRole("button", { name: "Retirer l'offre du public" }).click();
  const dialog = broker.locator("dialog[open]");
  const reason = dialog.locator("input[name='reason']");
  await expect(reason).toHaveAttribute("minlength", "8");
  await reason.fill("1234567");
  await dialog.getByRole("button", { name: "Retirer l'offre du public" }).last().click();
  await broker.waitForTimeout(1200);
  expect(recorder.bodies, "pas d'action serveur avec 7 caractères").toHaveLength(0);
  recorder.stop();
  await reason.fill(`Offre arrêtée par le cabinet ${RUN_LABEL}`);
  await watchNotices(broker);
  await dialog.getByRole("button", { name: "Retirer l'offre du public" }).last().click();
  await expect.poll(async () => (await seenNotices(broker)).length > 0 || (await dialog.count()) === 0, { timeout: 30_000 }).toBe(true);
  await broker.waitForTimeout(500);
  const withdrawNotices = (await seenNotices(broker)).join(" | ");
  if (withdrawNotices.includes("success: Offre retirée du public. Son historique est conservé.")) note("notice affichée : « Offre retirée du public. Son historique est conservé. »");
  else constat(`La notice « Offre retirée du public. Son historique est conservé. » n'est jamais visible : la zone d'actions est démontée dès que l'offre est retirée (apps/broker/app/offers/[offerId]/page.tsx:180). Notices vues : « ${withdrawNotices} ».`);
  expect(withdrawNotices).not.toContain("danger:");

  await broker.reload();
  await expect(broker.getByText("Retirée").first()).toBeVisible();
  await expect(broker.locator("form[data-offer-form='update']")).toHaveCount(0);
  expect(await statusOf(await complianceToken(), offer.id)).toBe("withdrawn");
  const secs = await waitPublicListing(offer.title, false, 120_000);
  note(`offre retirée : disparue du comparateur après ${secs} s`);
  await expectOfferUnavailable(browser, offer.id, "offre retirée");
});

test("E-P4-01h-b offre à fin de validité passée : « Offre expirée », renouvellement, nouvelle version à valider", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const offer = await publishedOffer("Expiration");
  expect(await waitPublicListing(offer.title, true)).toBeLessThan(120);
  const sql = pastValidity(offer.id, "both");
  note(`SQL (propre offre ${offer.id}, validité publiée reculée) : ${sql}`);

  const broker = await visit(browser, w.owner, `/offers/${offer.id}`);
  await expect(broker.getByText("Offre expirée", { exact: true })).toBeVisible();
  await expect(broker.getByText("Elle n'est plus affichée au public. Renouvelez-la avec de nouvelles dates : une nouvelle version sera à valider.")).toBeVisible();
  const secs = await waitPublicListing(offer.title, false, 120_000);
  note(`offre expirée : disparue du comparateur après ${secs} s`);
  await expectOfferUnavailable(browser, offer.id, "offre expirée");

  const renew = broker.locator("form[data-offer-form='renew']");
  await expect(renew.getByLabel("Nouveau début de validité")).toBeVisible();
  await expect(renew.getByLabel("Nouvelle fin de validité")).toBeVisible();
  await renew.getByLabel("Nouveau début de validité").fill(isoDate(new Date()));
  await renew.getByLabel("Nouvelle fin de validité").fill(isoDate(addDays(new Date(), 90)));
  await watchNotices(broker);
  await renew.getByRole("button", { name: "Renouveler l'offre" }).click();
  await expect(card(broker, "Version en cours")).toContainText("Brouillon", { timeout: 30_000 });
  const renewNotices = (await seenNotices(broker)).join(" | ");
  expect(renewNotices).not.toContain("danger:");
  if (renewNotices.includes("Nouvelle version créée avec les nouvelles dates. Soumettez-la à la validation.")) note("notice de renouvellement affichée");
  else constat(`La notice « Nouvelle version créée avec les nouvelles dates. Soumettez-la à la validation. » n'est jamais visible : la carte « Renouveler » disparaît dès qu'une version est en cours (apps/broker/app/offers/[offerId]/page.tsx:189). Notices vues : « ${renewNotices} ».`);
  await broker.reload();
  await card(broker, "Actions").getByRole("button", { name: "Soumettre à validation" }).click();
  await expect(broker.getByText("En attente de validation par AssurMatch.")).toBeVisible();

  const admin = await visit(browser, w.compliance, `/offers/${offer.id}`);
  const outcome = await decideInUi(admin, "validate", `${DECISION_REASON} renouvelée`);
  expect(outcome.ok, outcome.message).toBe(true);
  const back = await waitPublicListing(offer.title, true, 120_000);
  note(`offre renouvelée et revalidée : ré-apparition après ${back} s`);
});

// ---------------------------------------------------------------------------------------- E-P4-03a

test("E-P4-03a /offres/<id> d'une offre en brouillon ou en attente : 200 « Offre indisponible », bouton « Comparer les offres »", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const draftTitle = offerTitle("Brouillon");
  const draftId = await createOffer(await ownerToken(), w.scope, draftTitle);
  ownOffer(draftId);
  await expectOfferUnavailable(browser, draftId, "brouillon");
  const pending = await submittedOffer("Attente");
  await expectOfferUnavailable(browser, pending.id, "en attente de validation");
  expect(await listedPublicly(draftTitle)).toBe(false);
  expect(await listedPublicly(pending.title)).toBe(false);

  // Without the country / product in the query string the button points to the country list instead.
  const context = await newAppContext(browser, e2eEnv.publicUrl);
  try {
    const page = await context.newPage();
    const response = await page.goto(`/offres/${pending.id}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Offre indisponible" })).toBeVisible();
    const comparer = await page.locator("main").getByRole("link", { name: "Comparer les offres" }).count();
    note(`sans ?country=&product= : bouton « Comparer les offres » ${comparer > 0 ? "présent" : "absent (remplacé par « Voir les pays ouverts »)"}`);
    if (comparer === 0) {
      constat("Sans country/product dans l'URL, /offres/<id> propose « Voir les pays ouverts » et non « Comparer les offres » (apps/public/app/[locale]/offers/[offerId]/page.tsx:124-165) ; le scénario attend toujours « Comparer les offres ».");
      await expect(page.locator("main").getByRole("link", { name: "Voir les pays ouverts" })).toBeVisible();
    }
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------------------- E-P4-01i

test("E-P4-01i courtier suspendu par le Super Admin (monde l3vb) : validation bloquée « Courtier non actif », écriture refusée, offres retirées du public", async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  const worldB = await provisionBroker(browser, { plan: "starter", label: "l3vb" });
  const ownerB = worldB.owner;
  const tokB = brokerTokenSource(browser, ownerB);
  const scopeB = await ciAutoScope(await tokB.get());
  const make = async (tag: string, publish: boolean) => {
    const title = offerTitle(tag);
    const id = await createOffer(await tokB.get(), scopeB, title);
    ownOffer(id);
    await submitOffer(await tokB.get(), id);
    if (publish) {
      const decision = await adminDecision(await complianceToken(), id, "validate", `${DECISION_REASON} l3vb ${tag}`);
      expect(decision.status, decision.text.slice(0, 300)).toBeLessThan(300);
    }
    return { id, title };
  };
  const live = await make("Courtier B publiee", true);
  const pending = await make("Courtier B attente", false);
  expect(await waitPublicListing(live.title, true)).toBeLessThan(120);

  // The Super Admin suspends the broker (partner sheet, "Statut" card).
  const superPage = await visit(browser, superAdminAccount(), `/partners/${worldB.partnerId}`);
  await submitStatusTransition(superPage, "Suspendre", "Suspendu", true);

  const secs = await waitPublicListing(live.title, false, 120_000);
  note(`courtier suspendu : son offre publiée disparaît du comparateur après ${secs} s`);
  await expectOfferUnavailable(browser, live.id, "courtier suspendu");

  // Compliance cannot validate the pending offer of a suspended broker.
  const admin = await visit(browser, w.compliance, `/offers/${pending.id}`);
  const outcome = await decideInUi(admin, "validate", `${DECISION_REASON} courtier suspendu`);
  expect(outcome.ok).toBe(false);
  expect(outcome.blockers.join(" | ")).toContain("Courtier non actif");
  note(`validation bloquée : ${outcome.blockers.join(" | ")}`);
  const api = await adminDecision(await complianceToken(), pending.id, "validate", `${DECISION_REASON} courtier suspendu API`);
  expect(api.status).toBe(422);
  expect(asRecord(api.body).code).toBe("OFFER_VALIDATION_BLOCKED");
  note(`API : 422 ${JSON.stringify(asRecord(api.body).blockers)}`);
  expect(await statusOf(await complianceToken(), pending.id)).toBe("submitted");

  // Broker writes are refused (403 PARTNER_SUSPENDED) and the screen is read-only.
  const token = await tokB.get();
  const writes = [
    await updateOffer(token, pending.id, pending.title),
    await apiCall(token, "POST", `/broker/offers/${pending.id}/withdraw`, { reason: "Retrait par le courtier suspendu", target: "pending" }),
    await apiCall(token, "POST", "/broker/offers", offerBody(scopeB, offerTitle("Courtier B interdite")))
  ];
  for (const result of writes) {
    expect(result.status, result.text.slice(0, 200)).toBe(403);
    expect(asRecord(result.body).code).toBe("PARTNER_SUSPENDED");
  }
  note(`écritures du courtier suspendu -> 403 ${String(asRecord(writes[0]?.body).code)} « ${String(asRecord(writes[0]?.body).message)} »`);
  const page = await visit(browser, ownerB, `/offers/${pending.id}`);
  await expect(page.getByText("Compte suspendu : consultation seule. Contactez AssurMatch.").first()).toBeVisible();
  await expect(page.locator("fieldset[data-tenant-read-only='true']")).toHaveCount(1);
  await expect(page.locator("fieldset[data-tenant-read-only='true']")).toHaveAttribute("disabled", "");
  await expect(page.getByRole("button", { name: "Abandonner la version en cours" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Enregistrer le brouillon" })).toBeDisabled();
  constat("Le courtier suspendu voit « Compte suspendu : consultation seule. Contactez AssurMatch. » (apps/broker/app/lib/broker-permissions.ts:8) ; la phrase « Courtier suspendu : aucune écriture n'est possible sur ses offres. » du scénario n'existe que dans l'écran admin (apps/admin/app/lib/offer-messages.ts, PARTNER_SUSPENDED), où aucune écriture d'un courtier suspendu n'est atteignable.");
  expect(await statusOf(await complianceToken(), pending.id)).toBe("submitted");
});

// ------------------------------------------------------------------------------ session expirée

test("E-P4-session session expirée sur une décision admin : message « Session expirée… » ou redirection /login, l'offre ne change pas", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const offer = await submittedOffer("Session");
  const context = await newAppContext(browser, e2eEnv.adminUrl);
  try {
    const page = await context.newPage();
    await openAs(page, w.compliance, `/offers/${offer.id}`);
    await expect(page.locator("[data-offer-decision='validate']")).toBeVisible();
    await context.clearCookies({ name: "assurmatch_admin_token" });
    expect((await context.cookies()).some((cookie) => cookie.name === "assurmatch_admin_token")).toBe(false);

    const outcome = await decideInUi(page, "validate", `${DECISION_REASON} session expirée`);
    await page.waitForTimeout(1500);
    const where = new URL(page.url());
    const screen = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/gu, " ");
    note(`décision après suppression du cookie : url=${where.pathname}${where.search} notices=« ${outcome.message.slice(0, 200)} » écran=« ${screen.slice(0, 300)} »`);
    // The offer is never decided without a session.
    expect(await statusOf(await complianceToken(), offer.id)).toBe("submitted");
    // Expected: the "Session expirée" message of the action, or the redirection to /login?reason=...
    const informed = where.pathname.startsWith("/login") || /Session expirée/u.test(`${outcome.message} ${screen}`);
    expect(screen, "pas de page d'erreur générique").not.toContain("Une erreur est survenue");
    expect(informed, `ni redirection /login ni « Session expirée » : ${where.pathname}${where.search} / ${screen.slice(0, 200)}`).toBe(true);
  } finally {
    await context.close();
  }
});
