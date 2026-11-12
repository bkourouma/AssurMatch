import { expect, test, type Page } from "@playwright/test";
import { login, newAppContext, openAs, type BackOfficeAccount } from "./support/backoffice";
import {
  LABEL,
  SQL_DROP,
  XSS_IMG,
  XSS_SCRIPT,
  bypassValidation,
  call,
  messageOf,
  nativelyInvalid,
  pdfOfSize,
  submitAndRead,
  teamMemberAction,
  uploadProofToApi,
  watchPage
} from "./support/edge-p2p4-company";
import { e2eEnv } from "./support/env";
import { pdfFile } from "./support/files";
import type { BrokerWorld } from "./support/journey-state";
import { apiCall, asRecord, bearerToken, closeSessions, sessionPage, tokenFor, visit } from "./support/pro-roles";
import { card, uniqueSuffix } from "./support/ui";
import { addDays, appPage, complianceAccount, inviteMember, isoDate, provisionBroker } from "./support/world";

// Lot 3 (edge cases of phases 2 to 4), file 01: company profile, licence renewal, team and rights of the
// broker back-office (scenario section 7, T-04 / T-05 on the company data, E-P2-03c). The spec owns two
// throwaway Starter brokers (l3co with an owner, an agent and a read-only member; l3cb for the isolation
// check) and keeps their state in memory: the shared journey state file is only ever read.
// Authentication / activation / MFA / password cases belong to another file.

test.describe.configure({ mode: "serial" });

let world: BrokerWorld;
let other: BrokerWorld;
let agent: BackOfficeAccount;
let readOnly: BackOfficeAccount;
let agentName = "";
let readOnlyName = "";

const NOTE = (text: string) => test.info().annotations.push({ type: "constat", description: text });

test.beforeAll(async ({ browser }) => {
  test.setTimeout(25 * 60_000);
  world = await provisionBroker(browser, { plan: "starter", label: "l3co" });
  agentName = `Aya Agent L3-${uniqueSuffix().slice(0, 5)}`;
  readOnlyName = `Lea Lecteur L3-${uniqueSuffix().slice(0, 5)}`;
  agent = await inviteMember(browser, world.owner, { key: "agent", displayName: agentName, emailDomain: "broker-l3co.e2e.test" });
  readOnly = await inviteMember(browser, world.owner, { key: "readOnly", displayName: readOnlyName, emailDomain: "broker-l3co.e2e.test" });
  other = await provisionBroker(browser, { plan: "starter", label: "l3cb" });
});

test.afterAll(async () => {
  await closeSessions();
});

async function profileOf(token: string): Promise<Record<string, unknown>> {
  const result = await call(token, "GET", "/broker/account/profile");
  expect(result.status, "GET /broker/account/profile").toBe(200);
  return asRecord(result.body);
}

async function openCompany(browser: Parameters<typeof visit>[0], account: BackOfficeAccount = world.owner): Promise<Page> {
  const page = await visit(browser, account, "/company");
  watchPage(page);
  await expect(page.getByRole("heading", { name: /Contacts et présentation|Identité/u }).first()).toBeVisible();
  return page;
}

const SAVE = (page: Page) => card(page, "Contacts et présentation").getByRole("button", { name: "Enregistrer" });

/* ------------------------------------------------------------------------------------------ E-P2-04 */

test("E-P2-04a WhatsApp sans indicatif, e-mail invalide, 21 assureurs, ville d'un caractère : rien n'est enregistré", async ({ browser }) => {
  const page = await openCompany(browser);
  const token = await bearerToken(page);
  const before = await profileOf(token);

  const form = card(page, "Contacts et présentation");
  const email = form.locator("input[name='primaryEmail']");
  await form.locator("input[name='primaryWhatsApp']").fill("0102030405");
  await email.fill("pas-un-email");
  await form.locator("input[name='city']").fill("A");
  await form.locator("textarea[name='partnerInsurers']").fill(Array.from({ length: 21 }, (_, index) => `Assureur ${LABEL} ${index + 1}`).join("\n"));
  // The browser alone already refuses the e-mail (type=email): the server rules are reached by lifting the native validation.
  expect(await nativelyInvalid(email), "type=email refuse l'e-mail invalide avant l'envoi").toBe(true);
  NOTE("E-mail invalide : bloqué nativement par le champ type=email (la règle serveur n'est atteinte qu'en levant la validation du navigateur).");
  await bypassValidation(email);
  const notice = await submitAndRead(form, SAVE(page));
  NOTE(`Message réel : « ${notice.text} »`);
  expect(notice.tone).toBe("danger");
  expect(notice.text).toBe("Données invalides : vérifiez les champs (e-mail, téléphone au format +225..., justification de 10 caractères au moins, motif de 8 caractères au moins).");

  expect(await profileOf(token), "rien n'est enregistré").toEqual(before);

  // Each bad value alone is refused by the API with a 400 (and nothing is written either).
  const statuses: string[] = [];
  const cases: Array<[string, Record<string, unknown>]> = [
    ["primaryWhatsApp 0102030405", { primaryWhatsApp: "0102030405" }],
    ["primaryEmail pas-un-email", { primaryEmail: "pas-un-email" }],
    ["city A", { city: "A" }],
    ["partnerInsurers x21", { partnerInsurers: Array.from({ length: 21 }, (_, index) => `Assureur ${index + 1}`) }],
    ["adminContactPhone 07", { adminContactPhone: "07" }],
    ["legalName (champ d'identité, schéma strict)", { legalName: "Autre raison sociale" }]
  ];
  for (const [label, body] of cases) {
    const result = await call(token, "PATCH", "/broker/account/profile", body);
    statuses.push(`${label} -> ${result.status} ${messageOf(result).slice(0, 80)}`);
    expect(result.status, label).toBe(400);
  }
  NOTE(`API, valeur par valeur : ${statuses.join(" | ")}`);
  expect(await profileOf(token), "toujours rien d'enregistré").toEqual(before);
});

test("E-P2-04b vider un champ déjà renseigné puis Enregistrer : la valeur actuelle est conservée", async ({ browser }) => {
  const city = `Abidjan ${LABEL}`;
  const page = await openCompany(browser);
  const token = await bearerToken(page);
  const form = card(page, "Contacts et présentation");
  await form.locator("input[name='city']").fill(city);
  const first = await submitAndRead(form, SAVE(page));
  expect(first.text).toBe("Profil mis à jour. La modification est tracée dans le journal d'audit.");
  const stored = await profileOf(token);
  expect(stored.city).toBe(city);
  const whatsapp = String(stored.primaryWhatsApp);

  await page.reload();
  const again = card(page, "Contacts et présentation");
  await again.locator("input[name='city']").fill("");
  await again.locator("input[name='primaryWhatsApp']").fill("");
  const second = await submitAndRead(again, SAVE(page));
  NOTE(`Champs vidés (Ville, WhatsApp) puis enregistrés : « ${second.text} »`);
  expect(second.tone).toBe("success");
  const after = await profileOf(token);
  expect(after.city, "la ville est conservée").toBe(city);
  expect(after.primaryWhatsApp, "le WhatsApp est conservé").toBe(whatsapp);
  await page.reload();
  await expect(card(page, "Identité")).toContainText(city);
});

test("E-P2-04c deux onglets : le second enregistrement est refusé par PARTNER_UPDATE_CONFLICT", async ({ browser }) => {
  const first = await openCompany(browser);
  const second = await first.context().newPage();
  watchPage(second);
  await second.goto(`${e2eEnv.brokerUrl}/company`);
  await expect(second.getByRole("heading", { name: "Contacts et présentation" })).toBeVisible();

  const formA = card(first, "Contacts et présentation");
  await formA.locator("input[name='city']").fill(`Cocody onglet A ${LABEL}`);
  const savedA = await submitAndRead(formA, SAVE(first));
  expect(savedA.tone).toBe("success");

  const formB = card(second, "Contacts et présentation");
  await formB.locator("input[name='city']").fill(`Plateau onglet B ${LABEL}`);
  const conflict = await submitAndRead(formB, SAVE(second));
  NOTE(`Message réel du conflit : « ${conflict.text} »`);
  expect(conflict.tone).toBe("danger");
  expect(conflict.text).toBe("La fiche a été modifiée entre-temps : rechargez la page puis recommencez.");
  const token = await bearerToken(first);
  expect((await profileOf(token)).city, "la valeur du premier onglet est restée").toBe(`Cocody onglet A ${LABEL}`);

  // After a reload the second tab can save.
  await second.reload();
  const retry = card(second, "Contacts et présentation");
  await retry.locator("input[name='city']").fill(`Plateau onglet B ${LABEL}`);
  expect((await submitAndRead(retry, SAVE(second))).tone).toBe("success");
  await second.close();
});

test("E-P2-04d demande de modification d'identité : justification courte, aucun champ, doublon, succès, identité intacte", async ({ browser }) => {
  const page = await openCompany(browser);
  const token = await bearerToken(page);
  const before = await profileOf(token);
  const form = card(page, "Demander une modification d'identité");
  const send = form.getByRole("button", { name: "Envoyer la demande" });
  const newName = `${world.partnerName} SARL ${LABEL}`;

  await test.step("justification de 9 caractères", async () => {
    await form.locator("input[name='legalName']").fill(newName);
    const justification = form.locator("textarea[name='justification']");
    await justification.fill("123456789");
    NOTE(`Justification de 9 caractères : refus natif du champ (minLength=10) = ${await nativelyInvalid(justification)}`);
    await bypassValidation(justification);
    const notice = await submitAndRead(form, send);
    NOTE(`Message réel (action serveur) : « ${notice.text} »`);
    expect(notice.tone).toBe("danger");
    expect(notice.text).toBe("Justification obligatoire : au moins 10 caractères.");
    const api = await call(token, "POST", "/broker/account/requests/profile", { legalName: newName, justification: "123456789" });
    expect(api.status, "API : justification de 9 caractères").toBe(400);
  });

  await test.step("aucun champ à modifier", async () => {
    await page.reload();
    const empty = card(page, "Demander une modification d'identité");
    await empty.locator("textarea[name='justification']").fill("Justification valide de test L3");
    const notice = await submitAndRead(empty, empty.getByRole("button", { name: "Envoyer la demande" }));
    expect(notice.tone).toBe("danger");
    expect(notice.text).toBe("Renseignez au moins un champ à modifier.");
    const api = await call(token, "POST", "/broker/account/requests/profile", { justification: "Justification valide de test L3" });
    expect(api.status, "API : aucun champ").toBe(400);
  });

  await test.step("succès puis demande identique", async () => {
    await page.reload();
    const first = card(page, "Demander une modification d'identité");
    await first.locator("input[name='legalName']").fill(newName);
    await first.locator("textarea[name='justification']").fill("Changement de forme juridique (SARL), extrait RCCM joint.");
    const success = await submitAndRead(first, first.getByRole("button", { name: "Envoyer la demande" }));
    expect(success.tone).toBe("success");
    expect(success.text).toBe("Demande transmise : AssurMatch l'examine. Les valeurs actuelles restent en vigueur jusqu'à sa décision.");

    await page.reload();
    const twice = card(page, "Demander une modification d'identité");
    await twice.locator("input[name='legalName']").fill(newName);
    await twice.locator("textarea[name='justification']").fill("Changement de forme juridique (SARL), extrait RCCM joint.");
    const duplicate = await submitAndRead(twice, twice.getByRole("button", { name: "Envoyer la demande" }));
    NOTE(`Message réel du doublon : « ${duplicate.text} »`);
    expect(duplicate.tone).toBe("danger");
    expect(duplicate.text).toBe("Une demande identique est déjà en attente de décision d'AssurMatch.");
  });

  await test.step("l'identité légale n'a jamais été modifiée directement", async () => {
    await page.reload();
    await expect(card(page, "Identité")).toContainText(world.partnerName);
    await expect(card(page, "Identité")).not.toContainText("SARL");
    const requests = card(page, "Mes demandes");
    await expect(requests).toContainText("Modification d'identité");
    await expect(requests).toContainText("En attente d'AssurMatch");
    const after = await profileOf(token);
    expect(after.legalName).toBe(before.legalName);
    expect(after.registrationNumber).toBe(before.registrationNumber);
    expect(after.countryId).toBe(before.countryId);
    for (const [label, body] of [
      ["legalName", { legalName: "Direct" }],
      ["tradeName", { tradeName: "Direct" }],
      ["registrationNumber", { registrationNumber: "RC-DIRECT" }],
      ["countryId", { countryId: String(before.countryId) }]
    ] as const) {
      const direct = await call(token, "PATCH", "/broker/account/profile", body);
      expect(direct.status, `PATCH direct ${label}`).toBe(400);
    }
    expect((await profileOf(token)).legalName, "raison sociale inchangée").toBe(before.legalName);
  });

  await test.step("nettoyage : la demande en attente est annulée", async () => {
    const list = await call(token, "GET", "/broker/account/requests");
    const pending = (Array.isArray(list.body) ? list.body : []).filter((entry) => asRecord(entry).status === "pending");
    for (const entry of pending) {
      const cancelled = await call(token, "POST", `/broker/account/requests/${String(asRecord(entry).id)}/cancel`, {});
      expect(cancelled.status).toBe(200);
    }
  });
});

test("E-P2-04e + T-04 / T-05 XSS et SQL dans Ville et Assureurs partenaires : texte rendu, aucun dialog, aucune erreur 500", async ({ browser }) => {
  const rounds: Array<{ name: string; city: string; insurers: string[] }> = [
    { name: "XSS", city: XSS_SCRIPT, insurers: [XSS_SCRIPT, XSS_IMG] },
    { name: "SQL", city: SQL_DROP, insurers: [SQL_DROP] }
  ];
  const owner = await openCompany(browser);
  const admin = await visit(browser, complianceAccount(), `/partners/${world.partnerId}`);
  const adminWatch = watchPage(admin);
  const ownerWatch = watchPage(owner);
  const publicPage = await appPage(browser, e2eEnv.publicUrl);
  const publicWatch = watchPage(publicPage);
  const token = await bearerToken(owner);

  for (const round of rounds) {
    await test.step(`${round.name} : enregistrement`, async () => {
      await owner.goto(`${e2eEnv.brokerUrl}/company`);
      const form = card(owner, "Contacts et présentation");
      await form.locator("input[name='city']").fill(round.city);
      await form.locator("textarea[name='partnerInsurers']").fill(round.insurers.join("\n"));
      const notice = await submitAndRead(form, SAVE(owner));
      expect(notice.text, `${round.name}: ${notice.text}`).toBe("Profil mis à jour. La modification est tracée dans le journal d'audit.");
      const stored = await profileOf(token);
      expect(stored.city, "stocké tel quel").toBe(round.city);
      expect(stored.partnerInsurers, "stocké tel quel").toEqual(round.insurers);
    });

    await test.step(`${round.name} : rendu sur /company`, async () => {
      await owner.goto(`${e2eEnv.brokerUrl}/company`);
      await expect(card(owner, "Identité")).toContainText(round.city);
      await expect(card(owner, "Contacts")).toContainText(round.insurers[0] as string);
      await expect(owner.locator("img[src='x']")).toHaveCount(0);
      await expect(owner.locator("main script:not([src])").filter({ hasText: "alert(1)" })).toHaveCount(0);
    });

    await test.step(`${round.name} : rendu sur la fiche admin (Compliance Admin)`, async () => {
      await admin.goto(`${e2eEnv.adminUrl}/partners/${world.partnerId}`);
      await expect(admin.locator("body")).toContainText(round.city);
      await expect(admin.locator("body")).toContainText(round.insurers.join(", "));
      await expect(admin.locator("img[src='x']")).toHaveCount(0);
    });

    await test.step(`${round.name} : rendu sur la page publique du courtier`, async () => {
      const url = `${e2eEnv.publicUrl}/pays/CI/courtiers/${world.partnerId}`;
      let seen = false;
      const waitStart = Date.now();
      for (let attempt = 0; attempt < 30 && !seen; attempt += 1) {
        const response = await publicPage.goto(url);
        seen = (response?.status() ?? 0) === 200 && (await publicPage.locator("body").innerText()).includes(round.city);
        if (!seen) await publicPage.waitForTimeout(5_000);
      }
      const waited = Math.round((Date.now() - waitStart) / 1000);
      if (waited > 3) NOTE(`Page publique du courtier : la nouvelle ville n'apparaît qu'après ${waited} s (cache de la page publique, tour ${round.name}).`);
      expect(seen, `${round.name}: la ville ${round.city} s'affiche comme texte sur ${url}`).toBe(true);
      await expect(publicPage.locator("img[src='x']")).toHaveCount(0);
      NOTE("La page publique du courtier affiche la ville mais pas les assureurs partenaires (liste d'autorisation explicite du composant).");
    });
  }

  for (const [name, watch] of [["broker", ownerWatch], ["admin", adminWatch], ["public", publicWatch]] as const) {
    expect(watch.dialogs, `aucun dialog JS (${name})`).toEqual([]);
    expect(watch.serverErrors, `aucune réponse 5xx (${name})`).toEqual([]);
  }
  // The data stay usable after the SQL strings: the CRM list still answers.
  expect((await apiCall(token, "GET", "/broker/offers")).status).toBe(200);
  await publicPage.context().close();

  // Restore a harmless value.
  await owner.goto(`${e2eEnv.brokerUrl}/company`);
  const restore = card(owner, "Contacts et présentation");
  await restore.locator("input[name='city']").fill(`Abidjan ${LABEL}`);
  await restore.locator("textarea[name='partnerInsurers']").fill(`Assureur ${LABEL}`);
  expect((await submitAndRead(restore, SAVE(owner))).tone).toBe("success");
});

test("E-P2-04f l'agent ouvre /company en lecture seule et l'écriture API est refusée (403)", async ({ browser }) => {
  const page = await openCompany(browser, agent);
  await expect(page.getByText("Lecture seule : seuls le propriétaire et les managers modifient le profil et déposent des demandes.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contacts et présentation" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Demander une modification d'identité" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enregistrer" })).toHaveCount(0);
  // Contacts are still readable.
  await expect(card(page, "Contacts")).toContainText(world.owner.email);

  const token = await bearerToken(page);
  const ownerToken = await tokenFor(browser, world.owner);
  const before = await profileOf(ownerToken);
  const patch = await call(token, "PATCH", "/broker/account/profile", { city: "Ville imposée par l'agent" });
  expect(patch.status, `PATCH profil par l'agent : ${patch.text.slice(0, 200)}`).toBe(403);
  const identity = await call(token, "POST", "/broker/account/requests/profile", { legalName: "Agent SARL", justification: "Demande de l'agent interdite" });
  expect(identity.status).toBe(403);
  NOTE(`Corps réel du 403 (API) : ${messageOf(patch)}. Le texte « Action refusée : seuls le propriétaire et les managers du courtier peuvent faire cette action. » n'est produit que par l'écran à partir d'un 403 ; l'agent n'a aucun formulaire pour le déclencher.`);
  expect(await profileOf(ownerToken), "aucune donnée modifiée").toEqual(before);
});

/* ------------------------------------------------------------------------------------------ E-P2-05 */

let renewalNumber = "";

test("E-P2-05a renouvellement : expiration avant la date d'effet, puis expiration passée", async ({ browser }) => {
  const page = await visit(browser, world.owner, "/licenses");
  watchPage(page);
  const section = page.locator("section[aria-label^='Déposer le renouvellement de']").first();
  await expect(section).toBeVisible();
  const submit = section.getByRole("button", { name: "Enregistrer le renouvellement" });
  const number = `CI-REN-L3-${uniqueSuffix()}`;
  const fill = async (effective: string, expiration: string) => {
    await section.locator("input[name='licenseNumber']").fill(number);
    await section.locator("input[name='issuingAuthority']").fill("Direction des Assurances CI");
    await section.locator("input[name='effectiveDate']").fill(effective);
    await section.locator("input[name='expirationDate']").fill(expiration);
  };

  await fill(isoDate(addDays(new Date(), 10)), isoDate(new Date()));
  const reversed = await submitAndRead(section, submit);
  NOTE(`Expiration avant effet : « ${reversed.text} »`);
  expect(reversed.tone).toBe("danger");
  expect(reversed.text).toBe("Dates incohérentes : l'expiration doit suivre la date d'effet.");

  await fill("2020-01-01", "2020-12-31");
  const past = await submitAndRead(section, submit);
  NOTE(`Expiration passée : « ${past.text} »`);
  expect(past.tone).toBe("danger");
  expect(past.text).toBe("La date d'expiration du renouvellement doit être future.");

  const token = await bearerToken(page);
  const licenses = await call(token, "GET", "/broker/licenses");
  const items = Array.isArray(licenses.body) ? licenses.body : [];
  expect(items.length, "aucun brouillon créé par les refus").toBe(1);
  const licenseId = String(asRecord(items[0]).id);
  const reversedApi = await call(token, "POST", `/broker/licenses/${licenseId}/renewals`, { licenseNumber: number, issuingAuthority: "DAC", effectiveDate: isoDate(addDays(new Date(), 10)), expirationDate: isoDate(new Date()) });
  expect(reversedApi.status, "API : expiration avant effet").toBe(400);
  const pastApi = await call(token, "POST", `/broker/licenses/${licenseId}/renewals`, { licenseNumber: number, issuingAuthority: "DAC", effectiveDate: "2020-01-01", expirationDate: "2020-12-31" });
  expect(pastApi.status, `API : expiration passée ${pastApi.text.slice(0, 120)}`).toBe(422);
  NOTE(`API : expiration avant effet -> ${reversedApi.status} ${messageOf(reversedApi).slice(0, 80)} | expiration passée -> ${pastApi.status} ${messageOf(pastApi)}`);
});

test("E-P2-05b preuve de licence : note.txt refusé, gros.pdf (5 Mo + 1 octet) refusé", async ({ browser }) => {
  const page = await visit(browser, world.owner, "/licenses");
  watchPage(page);
  const section = page.locator("section[aria-label^='Déposer le renouvellement de']").first();
  renewalNumber = `CI-REN-L3-${uniqueSuffix()}`;
  await section.locator("input[name='licenseNumber']").fill(renewalNumber);
  await section.locator("input[name='issuingAuthority']").fill("Direction des Assurances CI");
  await section.locator("input[name='effectiveDate']").fill(isoDate(new Date()));
  await section.locator("input[name='expirationDate']").fill(isoDate(addDays(new Date(), 730)));
  await section.getByRole("button", { name: "Enregistrer le renouvellement" }).click();
  // The renewal form unmounts as soon as the draft exists (the renewed licence no longer offers "renew"),
  // so its success notice is never readable: the outcome is the new draft card.
  await expect(card(page, `Licence ${renewalNumber}`)).toBeVisible();
  await expect(page.locator("section[aria-label^='Déposer le renouvellement de']")).toHaveCount(0);
  NOTE("Renouvellement créé : le message « Renouvellement enregistré en brouillon. Déposez maintenant la preuve… » n'est jamais lisible (le formulaire et sa notice disparaissent au rafraîchissement, la licence ayant désormais un renouvellement en cours).");

  const proof = page.locator(`section[aria-label='Preuve de la licence ${renewalNumber}']`);
  await expect(proof).toBeVisible();
  // The page refreshes its data after the renewal: let it settle so the freshly mounted proof form keeps its file.
  await page.waitForTimeout(2_500);
  const send = proof.getByRole("button", { name: "Déposer la preuve" });

  await proof.locator("input[name='file']").setInputFiles({ name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("Ceci n'est pas une preuve de licence.\n") });
  await expect.poll(() => proof.locator("input[name='file']").evaluate((element) => (element as HTMLInputElement).files?.length ?? 0)).toBe(1);
  const text = await submitAndRead(proof, send);
  NOTE(`note.txt : « ${text.text} »`);
  expect(text.tone).toBe("danger");
  expect(text.text).toBe("Fichier refusé : PDF, JPEG ou PNG de 5 Mo au plus, au contenu conforme à son type.");

  const big = pdfOfSize("gros.pdf", 5 * 1024 * 1024 + 1);
  await proof.locator("input[name='file']").setInputFiles({ name: big.name, mimeType: big.mimeType, buffer: big.buffer });
  await expect.poll(() => proof.locator("input[name='file']").evaluate((element) => (element as HTMLInputElement).files?.length ?? 0)).toBe(1);
  const heavy = await submitAndRead(proof, send);
  NOTE(`gros.pdf (5 Mo + 1 octet) : « ${heavy.text} »`);
  expect(heavy.tone).toBe("danger");
  expect(heavy.text).toBe("Fichier trop volumineux : 5 Mo au maximum.");

  // Same files straight at the API: the server enforces both rules too.
  const token = await bearerToken(page);
  const licenses = await call(token, "GET", "/broker/licenses");
  const draft = (Array.isArray(licenses.body) ? licenses.body : []).map(asRecord).find((entry) => entry.licenseNumber === renewalNumber);
  expect(draft, "le brouillon de renouvellement est listé").toBeDefined();
  const draftId = String(draft?.id);
  const txtApi = await uploadProofToApi(token, draftId, { name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("Ceci n'est pas une preuve de licence.\n") });
  const bigApi = await uploadProofToApi(token, draftId, big);
  const disguisedApi = await uploadProofToApi(token, draftId, { name: "faux.pdf", mimeType: "application/pdf", buffer: Buffer.from("pas du tout un PDF\n") });
  NOTE(`API multipart : note.txt -> ${txtApi.status} ${messageOf(txtApi).slice(0, 80)} | gros.pdf -> ${bigApi.status} ${messageOf(bigApi).slice(0, 80)} | faux.pdf (octets non PDF) -> ${disguisedApi.status} ${messageOf(disguisedApi).slice(0, 80)}`);
  expect([400, 415, 422], `note.txt -> ${txtApi.status}`).toContain(txtApi.status);
  expect(bigApi.status, `gros.pdf -> ${bigApi.status}`).toBe(413);
  expect([400, 415, 422], `faux.pdf -> ${disguisedApi.status}`).toContain(disguisedApi.status);
  const after = await call(token, "GET", "/broker/licenses");
  const draftAfter = (Array.isArray(after.body) ? after.body : []).map(asRecord).find((entry) => entry.licenseNumber === renewalNumber);
  expect(draftAfter?.status, "le brouillon n'a pas bougé").toBe("draft");
  expect(draftAfter?.documents, "aucune preuve enregistrée").toEqual([]);
});

test("E-P2-05c preuve valide : la licence est en revue par la conformité (notice) et un second renouvellement est refusé", async ({ browser }) => {
  expect(renewalNumber, "E-P2-05b a créé le brouillon").not.toBe("");
  const page = await visit(browser, world.owner, "/licenses");
  const proof = page.locator(`section[aria-label='Preuve de la licence ${renewalNumber}']`);
  const file = pdfFile("preuve-renouvellement-l3.pdf", `Preuve ${renewalNumber}`);
  await proof.locator("input[name='file']").setInputFiles(file);
  const sent = await submitAndRead(proof, proof.getByRole("button", { name: "Déposer la preuve" }));
  NOTE(`Dépôt d'une preuve PDF valide : « ${sent.text} »`);
  expect(sent.tone, sent.text).toBe("success");

  const renewalCard = card(page, `Licence ${renewalNumber}`);
  await expect(renewalCard.getByText("En revue par la conformité AssurMatch : la licence n'est pas utilisée pour le routage avant sa validation.")).toBeVisible({ timeout: 30_000 });
  await expect(renewalCard).toContainText("En revue par la conformité");
  await expect(renewalCard).toContainText("preuve-renouvellement-l3.pdf");
  await expect(card(page, /^Licence CI-AGR-/u)).toContainText("Valide");
  await expect(card(page, /^Licence CI-AGR-/u)).toContainText("Renouvellement en cours");

  const token = await bearerToken(page);
  const licenses = await call(token, "GET", "/broker/licenses");
  const original = (Array.isArray(licenses.body) ? licenses.body : []).map(asRecord).find((entry) => String(entry.licenseNumber).startsWith("CI-AGR-"));
  const second = await call(token, "POST", `/broker/licenses/${String(original?.id)}/renewals`, {
    licenseNumber: `CI-REN-L3-bis-${uniqueSuffix()}`,
    issuingAuthority: "Direction des Assurances CI",
    effectiveDate: isoDate(new Date()),
    expirationDate: isoDate(addDays(new Date(), 900))
  });
  NOTE(`Second renouvellement pendant le premier : ${second.status} ${messageOf(second)}`);
  expect(second.status).toBe(409);
});

/* ------------------------------------------------------------------------------------------ E-P2-06 */

async function openTeam(browser: Parameters<typeof visit>[0], account: BackOfficeAccount = world.owner): Promise<Page> {
  const page = await visit(browser, account, "/team");
  watchPage(page);
  await expect(page.getByRole("heading", { name: "Équipe", exact: true }).first()).toBeVisible();
  return page;
}

test("E-P2-06a inviter un e-mail déjà utilisé : 409 neutre, l'adresse n'est pas révélée", async ({ browser }) => {
  const page = await openTeam(browser);
  const token = await bearerToken(page);
  const own = await call(token, "POST", "/broker/team", { email: agent.email, displayName: "Doublon API L3", role: "broker_agent" });
  const foreign = await call(token, "POST", "/broker/team", { email: other.owner.email, displayName: "Doublon API L3", role: "broker_agent" });
  NOTE(`API : e-mail d'un membre -> ${own.status} ${messageOf(own)} | e-mail d'un autre cabinet -> ${foreign.status} ${messageOf(foreign)}`);

  const invite = card(page, "Inviter un collaborateur");
  await invite.getByLabel(/Nom affiché/u).fill("Doublon L3");
  await invite.getByLabel(/E-mail professionnel/u).fill(agent.email);
  await invite.getByLabel(/Rôle/u).selectOption("broker_agent");
  const notice = await submitAndRead(invite, invite.getByRole("button", { name: "Inviter", exact: true }));
  NOTE(`Message réel (écran) : « ${notice.text} »`);
  expect(notice.tone).toBe("danger");
  expect(notice.text).toBe("Cette adresse e-mail est déjà utilisée.");
  expect(notice.text).not.toContain(agent.email);

  expect(own.status, own.text).toBe(409);
  expect(own.text).toContain("EMAIL_ALREADY_USED");
  expect(own.text.toLowerCase(), "aucun détail interne (Prisma, contrainte SQL) dans la réponse").not.toMatch(/prisma|constraint|user_email_key/u);
  expect(foreign.status, "e-mail du propriétaire d'un autre courtier").toBe(409);
  const withoutCorrelation = (text: string): string => text.replace(/"correlationId":"[^"]*"/u, "");
  expect(withoutCorrelation(foreign.text), "même réponse pour un compte de ce cabinet et d'un autre").toBe(withoutCorrelation(own.text));
  expect(own.text).not.toContain(agent.email);
  expect(foreign.text).not.toContain(other.owner.email);
});

test("E-P2-06b nom d'un caractère, e-mail invalide, rôle propriétaire : refusés (400)", async ({ browser }) => {
  const page = await openTeam(browser);
  const invite = card(page, "Inviter un collaborateur");
  const name = invite.getByLabel(/Nom affiché/u);
  const email = invite.getByLabel(/E-mail professionnel/u);
  const send = invite.getByRole("button", { name: "Inviter", exact: true });

  // The role list never proposes the owner.
  const labels = (await invite.getByLabel(/Rôle/u).locator("option").allInnerTexts()).map((text) => text.trim());
  expect(labels).toEqual(["Manager", "Agent", "Lecture seule"]);

  await name.fill("A");
  await email.fill(`nom.court.${uniqueSuffix()}@broker-l3co.e2e.test`);
  NOTE(`Nom d'un caractère : refus natif (minLength=2) = ${await nativelyInvalid(name)}`);
  await bypassValidation(name);
  const shortName = await submitAndRead(invite, send);
  NOTE(`Nom d'un caractère (action serveur) : « ${shortName.text} »`);
  expect(shortName.tone).toBe("danger");
  expect(shortName.text).toContain("Données invalides");

  await page.reload();
  const again = card(page, "Inviter un collaborateur");
  await again.getByLabel(/Nom affiché/u).fill(`Nom valide ${LABEL}`);
  const badEmail = again.getByLabel(/E-mail professionnel/u);
  await badEmail.fill("pas-un-email");
  NOTE(`E-mail invalide : refus natif (type=email) = ${await nativelyInvalid(badEmail)}`);
  await bypassValidation(badEmail);
  const invalid = await submitAndRead(again, again.getByRole("button", { name: "Inviter", exact: true }));
  NOTE(`E-mail invalide (action serveur) : « ${invalid.text} »`);
  expect(invalid.tone).toBe("danger");
  expect(invalid.text).toContain("Données invalides");

  const token = await bearerToken(page);
  const base = { email: `role.interdit.${uniqueSuffix()}@broker-l3co.e2e.test`, displayName: `Role interdit ${LABEL}` };
  const statuses: string[] = [];
  for (const role of ["broker_owner_starter", "broker_owner_pro", "super_admin", "n_importe_quoi"]) {
    const result = await call(token, "POST", "/broker/team", { ...base, role });
    statuses.push(`${role} -> ${result.status}`);
    expect(result.status, `rôle ${role}`).toBe(400);
  }
  const short = await call(token, "POST", "/broker/team", { email: base.email, displayName: "A", role: "broker_agent" });
  const mail = await call(token, "POST", "/broker/team", { email: "pas-un-email", displayName: "Nom valide", role: "broker_agent" });
  expect(short.status, "API : nom d'un caractère").toBe(400);
  expect(mail.status, "API : e-mail invalide").toBe(400);
  NOTE(`API : ${statuses.join(" | ")} | nom 1 caractère -> ${short.status} | e-mail invalide -> ${mail.status}`);
});

test("E-P2-06c s'auto-désactiver, motif de 7 caractères ; le dernier propriétaire", async ({ browser }) => {
  const page = await openTeam(browser);
  const token = await bearerToken(page);
  const me = asRecord((await apiCall(token, "GET", "/auth/me")).body);
  const ownerId = String(me.actorId);
  expect(ownerId).not.toBe("");

  await test.step("la ligne du propriétaire n'offre aucune action sur lui-même", async () => {
    const row = page.getByRole("row").filter({ hasText: world.owner.email }).first();
    await expect(row).toBeVisible();
    await expect(row.getByRole("button")).toHaveCount(0);
  });

  await test.step("auto-désactivation, auto-changement de rôle par l'API : 422 TEAM_SELF_ACTION", async () => {
    const deactivate = await call(token, "POST", `/broker/team/${ownerId}/deactivate`, { reason: "Motif de test E2E L3" });
    NOTE(`Auto-désactivation : ${deactivate.status} ${messageOf(deactivate)}`);
    expect(deactivate.status, deactivate.text).toBe(422);
    expect(JSON.stringify(deactivate.body)).toContain("TEAM_SELF_ACTION");
    const role = await call(token, "PATCH", `/broker/team/${ownerId}/role`, { role: "broker_agent", reason: "Motif de test E2E L3" });
    expect(role.status, role.text).toBe(422);
    expect(JSON.stringify(role.body)).toContain("TEAM_SELF_ACTION");
    const reactivate = await call(token, "POST", `/broker/team/${ownerId}/reactivate`, { reason: "Motif de test E2E L3" });
    expect(reactivate.status, "réactivation de soi-même").toBe(422);
    // The owner is still active.
    const team = await call(token, "GET", "/broker/team");
    const self = (Array.isArray(team.body) ? team.body : []).map(asRecord).find((entry) => entry.id === ownerId);
    expect(self?.status).toBe("active");
    expect(self?.roles).toEqual(expect.arrayContaining(["broker_owner_starter"]));
  });

  await test.step("motif de 7 caractères : écran puis API", async () => {
    const result = await teamMemberAction(page, agentName, "Désactiver", { reason: "1234567", bypass: true });
    NOTE(`Motif de 7 caractères : refus natif (minLength=8) = ${result.reasonInvalidNatively} ; message (action serveur) : « ${result.notice?.text} »`);
    expect(result.notice?.tone).toBe("danger");
    expect(result.notice?.text).toBe("Motif obligatoire : au moins 8 caractères, conservé dans l'audit.");
    const team = await call(token, "GET", "/broker/team");
    const member = (Array.isArray(team.body) ? team.body : []).map(asRecord).find((entry) => entry.email === agent.email);
    expect(member?.status, "l'agent est resté actif").toBe("active");
    const api = await call(token, "POST", `/broker/team/${String(member?.id)}/deactivate`, { reason: "1234567" });
    expect(api.status, "API : motif de 7 caractères").toBe(400);
    const apiEight = await call(token, "POST", `/broker/team/${String(member?.id)}/deactivate`, { reason: "" });
    expect(apiEight.status, "API : motif vide").toBe(400);
  });
});

test("E-P2-06c' dernier propriétaire actif (TEAM_LAST_OWNER)", async () => {
  test.skip(true, "Non exécuté : inatteignable par l'API. Le propriétaire qui se désactive reçoit TEAM_SELF_ACTION avant le contrôle du dernier propriétaire ; un manager reçoit 403 (propriétaire protégé) ; un second propriétaire ne se crée que côté admin. broker-team.service.ts:131-139 vs :172-176.");
});

test("E-P2-06e agent et lecteur sur /team et /offers/new, puis table des droits propriétaire / agent / lecteur via l'API", async ({ browser }) => {
  for (const [key, account] of [["agent", agent], ["lecteur", readOnly]] as const) {
    await test.step(`${key} : /team est en lecture seule`, async () => {
      const page = await openTeam(browser, account);
      await expect(page.getByText("Lecture seule : seuls le propriétaire et les managers gèrent l'équipe.")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Inviter un collaborateur" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Désactiver|Réactiver|Changer le rôle/u })).toHaveCount(0);
      await expect(page.getByRole("table", { name: "Membres de l'équipe" })).toContainText(account.email);
    });
    await test.step(`${key} : /offers/new refuse la création`, async () => {
      const page = await visit(browser, account, "/offers/new");
      await expect(page.getByText("Création réservée au propriétaire et aux managers du cabinet. Les agents et les comptes en lecture seule consultent uniquement.")).toBeVisible();
      await expect(page.locator("select[name='scope']")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Créer le brouillon" })).toHaveCount(0);
    });
  }

  const tokens = {
    propriétaire: await tokenFor(browser, world.owner),
    agent: await tokenFor(browser, agent),
    lecteur: await tokenFor(browser, readOnly)
  };
  const ownerId = String(asRecord((await apiCall(tokens.propriétaire, "GET", "/auth/me")).body).actorId);
  const licenses = await call(tokens.propriétaire, "GET", "/broker/licenses");
  const licenseId = String(asRecord((Array.isArray(licenses.body) ? licenses.body : [])[0]).id);
  const roles = ["propriétaire", "agent", "lecteur"] as const;
  const lines: string[] = [];

  // Reads: every broker role reads company, requests, licences, team and offers.
  for (const [label, path] of [
    ["société : lire le profil", "/broker/account/profile"],
    ["société : lire les demandes", "/broker/account/requests"],
    ["licences : lire", "/broker/licenses"],
    ["équipe : lire", "/broker/team"],
    ["offres : lire la liste", "/broker/offers"],
    ["offres : lire la couverture", "/broker/offers/coverage"]
  ] as const) {
    const row: string[] = [];
    for (const role of roles) {
      const result = await call(tokens[role], "GET", path);
      row.push(`${role} ${result.status}`);
      expect(result.status, `${label} (${role})`).toBe(200);
    }
    lines.push(`${label} [GET ${path}] : ${row.join(", ")}`);
  }

  // Writes, valid body: refused to the agent and the reader (403). The owner column is only filled when the call is harmless.
  const harmlessCity = `Abidjan ${LABEL}`;
  const validWrites: Array<{ label: string; method: "POST" | "PATCH"; path: string; body: Record<string, unknown>; owner: number | undefined }> = [
    { label: "société : modifier le profil", method: "PATCH", path: "/broker/account/profile", body: { city: harmlessCity }, owner: 200 },
    { label: "société : demande d'identité", method: "POST", path: "/broker/account/requests/profile", body: { legalName: `Refus ${LABEL}`, justification: "Demande refusée par le droit (test E2E L3)" }, owner: undefined },
    { label: "licences : renouveler", method: "POST", path: `/broker/licenses/${licenseId}/renewals`, body: { licenseNumber: `CI-REN-L3-${uniqueSuffix()}`, issuingAuthority: "DAC", effectiveDate: isoDate(new Date()), expirationDate: isoDate(addDays(new Date(), 800)) }, owner: undefined },
    { label: "équipe : inviter", method: "POST", path: "/broker/team", body: { email: `droit.refuse.${uniqueSuffix()}@broker-l3co.e2e.test`, displayName: "Invité refusé L3", role: "broker_agent" }, owner: undefined },
    { label: "équipe : désactiver (soi-même pour le propriétaire)", method: "POST", path: `/broker/team/${ownerId}/deactivate`, body: { reason: "Motif de test E2E L3" }, owner: 422 }
  ];
  for (const write of validWrites) {
    const row: string[] = [];
    for (const role of roles) {
      if (role === "propriétaire" && write.owner === undefined) {
        row.push("propriétaire (non envoyé : écriture réelle)");
        continue;
      }
      const result = await call(tokens[role], write.method, write.path, write.body);
      row.push(`${role} ${result.status}`);
      if (role === "propriétaire") expect(result.status, `${write.label} (propriétaire)`).toBe(write.owner);
      else expect(result.status, `${write.label} avec un corps valide (${role}) : ${result.text.slice(0, 120)}`).toBe(403);
    }
    lines.push(`${write.label} [${write.method} ${write.path.replace(/[0-9a-f-]{36}/u, ":id")}], corps valide : ${row.join(", ")}`);
  }

  // Writes, invalid (empty) body: the owner reaches the validation (400); the others see the validation too, before the access check.
  const emptyWrites: Array<{ label: string; method: "POST" | "PATCH"; path: string; ownerRange: number[] }> = [
    { label: "société : modifier le profil", method: "PATCH", path: "/broker/account/profile", ownerRange: [422] },
    { label: "société : demande d'identité", method: "POST", path: "/broker/account/requests/profile", ownerRange: [400] },
    { label: "licences : renouveler", method: "POST", path: `/broker/licenses/${licenseId}/renewals`, ownerRange: [400] },
    { label: "équipe : inviter", method: "POST", path: "/broker/team", ownerRange: [400] },
    { label: "offres : créer", method: "POST", path: "/broker/offers", ownerRange: [400, 422] }
  ];
  const ordering: string[] = [];
  for (const write of emptyWrites) {
    const row: string[] = [];
    for (const role of roles) {
      const result = await call(tokens[role], write.method, write.path, {});
      row.push(`${role} ${result.status}`);
      expect(result.status, `${write.label} corps vide (${role}) : pas de 2xx ni de 5xx`).toBeGreaterThanOrEqual(400);
      expect(result.status).toBeLessThan(500);
      if (role === "propriétaire") expect(write.ownerRange, `${write.label} corps vide (propriétaire) : ${result.status}`).toContain(result.status);
      else if (result.status === 400) ordering.push(`${write.label} (${role})`);
    }
    lines.push(`${write.label} [${write.method} ${write.path.replace(/[0-9a-f-]{36}/u, ":id")}], corps vide : ${row.join(", ")}`);
  }
  NOTE(`Table des droits (statuts réels de l'API ; 403 = droit refusé) : ${lines.join(" ## ")}`);
  if (ordering.length > 0) {
    NOTE(`Ordre des contrôles : avec un corps invalide, l'agent et le lecteur reçoivent 400 (validation du contrôleur) avant le 403 du droit (service) pour : ${ordering.join(", ")} ; ce refus n'est pas audité en rbac_denied (controleurs runtime-http-wiring.module.ts:595-598, 614-616, 654-656, 668-670 ; offres : le service contrôle le droit avant le corps).`);
  }
});

test("T-02 isolation : un autre courtier ne voit ni ne touche l'équipe, la société ni les licences du cabinet l3co", async ({ browser }) => {
  const tokenA = await tokenFor(browser, world.owner);
  const tokenB = await tokenFor(browser, other.owner);
  const teamA = await call(tokenA, "GET", "/broker/team");
  const agentRow = (Array.isArray(teamA.body) ? teamA.body : []).map(asRecord).find((entry) => entry.email === agent.email);
  const licensesA = await call(tokenA, "GET", "/broker/licenses");
  const licenseA = asRecord((Array.isArray(licensesA.body) ? licensesA.body : [])[0]);
  expect(agentRow?.id).toBeTruthy();

  const teamB = await call(tokenB, "GET", "/broker/team");
  expect(teamB.status).toBe(200);
  for (const email of [world.owner.email, agent.email, readOnly.email]) expect(teamB.text, "l'équipe de B ne cite pas A").not.toContain(email);
  expect(asRecord((await call(tokenB, "GET", "/broker/account/profile")).body).id).toBe(other.partnerId);

  const lines: string[] = [];
  const attempts: Array<[string, "POST" | "PATCH", string, Record<string, unknown>]> = [
    ["désactiver l'agent de A", "POST", `/broker/team/${String(agentRow?.id)}/deactivate`, { reason: "Tentative inter-cabinet L3" }],
    ["changer le rôle de l'agent de A", "PATCH", `/broker/team/${String(agentRow?.id)}/role`, { role: "broker_read_only", reason: "Tentative inter-cabinet L3" }],
    ["réactiver l'agent de A", "POST", `/broker/team/${String(agentRow?.id)}/reactivate`, { reason: "Tentative inter-cabinet L3" }],
    ["renouveler la licence de A", "POST", `/broker/licenses/${String(licenseA.id)}/renewals`, { licenseNumber: "CI-X-L3-123", issuingAuthority: "DAC", effectiveDate: isoDate(new Date()), expirationDate: isoDate(addDays(new Date(), 400)) }],
    ["annuler une demande inconnue de A", "POST", "/broker/account/requests/00000000-0000-4000-8000-000000000000/cancel", {}]
  ];
  for (const [label, method, path, body] of attempts) {
    const result = await call(tokenB, method, path, body);
    lines.push(`${label} -> ${result.status}`);
    expect([403, 404], `${label} -> ${result.status} ${result.text.slice(0, 120)}`).toContain(result.status);
    expect(result.text).not.toContain(agent.email);
  }
  const proofResult = await uploadProofToApi(tokenB, String(licenseA.id), pdfFile("intrus.pdf", "Intrus L3"));
  lines.push(`déposer une preuve sur la licence de A -> ${proofResult.status}`);
  expect([403, 404], `preuve -> ${proofResult.status}`).toContain(proofResult.status);
  NOTE(`Accès croisés (courtier l3cb vers l3co) : ${lines.join(" | ")}`);

  const check = await call(tokenA, "GET", "/broker/team");
  const still = (Array.isArray(check.body) ? check.body : []).map(asRecord).find((entry) => entry.email === agent.email);
  expect(still?.status, "l'agent de A est intact").toBe("active");
});

test("E-P2-06d désactiver l'agent pendant qu'il est connecté : coupé à sa prochaine requête, puis Réactiver", async ({ browser }) => {
  const agentPage = await visit(browser, agent, "/leads");
  watchPage(agentPage);
  expect(new URL(agentPage.url()).pathname.startsWith("/login")).toBe(false);
  const agentToken = await bearerToken(agentPage);
  expect((await call(agentToken, "GET", "/broker/team")).status, "avant désactivation").toBe(200);

  const ownerPage = await openTeam(browser);
  const deactivated = await teamMemberAction(ownerPage, agentName, "Désactiver", { reason: "Départ du conseiller (test E2E L3)" });
  NOTE(`Message côté propriétaire : « ${deactivated.notice?.text} »`);
  expect(deactivated.notice?.tone).toBe("success");
  expect(deactivated.notice?.text).toBe("Collaborateur désactivé : son accès est coupé dès sa prochaine requête.");
  await ownerPage.reload();
  const agentRow = ownerPage.getByRole("row").filter({ hasText: agent.email }).first();
  await expect(agentRow).toContainText("Désactivé");
  await expect(agentRow.getByRole("button", { name: "Réactiver", exact: true })).toBeVisible();

  const startedAt = Date.now();
  await expect
    .poll(async () => (await call(agentToken, "GET", "/broker/team")).status, { timeout: 45_000, message: "l'API coupe l'agent" })
    .toBe(401);
  const apiCutAfter = Date.now() - startedAt;
  await agentPage.goto(`${e2eEnv.brokerUrl}/leads`);
  await agentPage.waitForURL((url) => url.pathname.startsWith("/login"), { timeout: 45_000 });
  NOTE(`Coupure : l'API répond 401 ${apiCutAfter} ms après la désactivation ; l'écran de l'agent renvoie sur ${new URL(agentPage.url()).pathname}${new URL(agentPage.url()).search}`);

  const reactivated = await teamMemberAction(ownerPage, agentName, "Réactiver", { reason: "Retour du conseiller (test E2E L3)" });
  NOTE(`Message de réactivation : « ${reactivated.notice?.text} »`);
  expect(reactivated.notice?.tone).toBe("success");
  await ownerPage.reload();
  await expect(ownerPage.getByRole("row").filter({ hasText: agent.email }).first()).toContainText("Actif");

  await openAs(agentPage, agent, "/leads");
  expect(new URL(agentPage.url()).pathname.startsWith("/login"), "l'agent réactivé se reconnecte (mot de passe + MFA)").toBe(false);
});

/* ------------------------------------------------------------------------------------------ E-P2-03c */

test("E-P2-03c cookies de session distincts : admin puis courtier dans le même navigateur, aucun passage de l'un à l'autre", async ({ browser }) => {
  const compliance = complianceAccount();
  const context = await browser.newContext({ locale: "fr-FR", timezoneId: "Africa/Abidjan" });
  const page = await context.newPage();
  watchPage(page);
  await login(page, compliance, "/partners");
  await login(page, world.owner, "/company");

  const cookies = await context.cookies();
  const adminCookie = cookies.find((entry) => entry.name === "assurmatch_admin_token");
  const brokerCookie = cookies.find((entry) => entry.name === "assurmatch_broker_token");
  expect(adminCookie?.value, "cookie de l'admin").toBeTruthy();
  expect(brokerCookie?.value, "cookie du courtier").toBeTruthy();
  expect(adminCookie?.value).not.toBe(brokerCookie?.value);
  NOTE(`Cookies : ${cookies.map((entry) => `${entry.name} (httpOnly=${entry.httpOnly}, sameSite=${entry.sameSite}, domaine=${entry.domain})`).join(" ; ")}`);

  // Both sessions live side by side and each app only reads its own cookie.
  await page.goto(`${e2eEnv.adminUrl}/partners`);
  expect(new URL(page.url()).pathname, "l'admin garde sa session").toBe("/partners");
  await page.goto(`${e2eEnv.brokerUrl}/company`);
  expect(new URL(page.url()).pathname, "le courtier garde sa session").toBe("/company");
  const adminToken = adminCookie?.value as string;
  const brokerToken = brokerCookie?.value as string;

  // A broker token is useless on the admin API, and an admin token on the broker API.
  const adminBaseline = await call(adminToken, "GET", "/admin/partner-requests");
  expect(adminBaseline.status, "le jeton admin lit l'API admin").toBe(200);
  const brokerOnAdmin = await call(brokerToken, "GET", "/admin/partner-requests");
  NOTE(`Jeton courtier sur l'API admin (GET /admin/partner-requests) : ${brokerOnAdmin.status} ${messageOf(brokerOnAdmin).slice(0, 100)}`);
  expect([401, 403]).toContain(brokerOnAdmin.status);
  const brokerOnUsers = await call(brokerToken, "GET", "/admin/users");
  if (brokerOnUsers.status === 200) {
    // By design a partner actor may read the users of its own partner (admin-users.controller.ts:228): nothing of another tenant, no secret.
    const listed = Array.isArray(brokerOnUsers.body) ? brokerOnUsers.body.map(asRecord) : [];
    NOTE(`Jeton courtier sur GET /admin/users : 200, ${listed.length} utilisateur(s), tous du cabinet ${listed.every((entry) => entry.partnerTenantId === world.partnerId)} (lecture limitée à son propre cabinet, doublon de /broker/team).`);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((entry) => entry.partnerTenantId === world.partnerId), "aucun utilisateur d'un autre périmètre").toBe(true);
  } else {
    expect([401, 403, 404], `jeton courtier sur /admin/users -> ${brokerOnUsers.status}`).toContain(brokerOnUsers.status);
  }
  const adminOnBroker = await call(adminToken, "GET", "/broker/account/profile");
  NOTE(`Jeton admin sur l'API courtier (GET /broker/account/profile) : ${adminOnBroker.status} ${messageOf(adminOnBroker).slice(0, 100)}`);
  expect([401, 403]).toContain(adminOnBroker.status);
  await context.close();

  // A context that only holds a broker session does not open the admin.
  const brokerOnly = await newAppContext(browser, e2eEnv.brokerUrl);
  const brokerPage = await brokerOnly.newPage();
  watchPage(brokerPage);
  await login(brokerPage, world.owner, "/company");
  await brokerPage.goto(`${e2eEnv.adminUrl}/partners`);
  await brokerPage.waitForURL((url) => url.pathname.startsWith("/login"));
  expect(new URL(brokerPage.url()).origin).toBe(e2eEnv.adminUrl);
  await expect(brokerPage.getByRole("table", { name: /Courtiers|Partenaires/u })).toHaveCount(0);

  // Forged cookie: the broker token presented as an admin session.
  const forgedBroker = await bearerToken(brokerPage);
  await brokerOnly.addCookies([{ name: "assurmatch_admin_token", value: forgedBroker, url: e2eEnv.adminUrl }]);
  await brokerPage.goto(`${e2eEnv.adminUrl}/partners`);
  const forgedPath = new URL(brokerPage.url()).pathname;
  const forgedBody = (await brokerPage.locator("body").innerText()).replace(/\s+/gu, " ").slice(0, 160);
  NOTE(`Jeton courtier posé dans le cookie assurmatch_admin_token : l'admin affiche ${forgedPath} (« ${forgedBody} »)`);
  expect(forgedPath.startsWith("/partners") && !forgedBody.includes("Partenaires"), "aucune donnée d'administration avec un jeton courtier").toBe(false);
  expect(brokerPage.url()).not.toContain(world.partnerId);
  await brokerOnly.close();
  void sessionPage;
});

test("E-P2-03c' un jeton courtier (agent, lecteur) sur GET /admin/users est refusé (403) et n'expose aucun secret de compte", async ({ browser }) => {
  const sensitive = /passwordHash|mfaSecretEncrypted|mfaBackupCodesHashes|passwordResetTokenHash/u;
  const lines: string[] = [];
  const leaks: string[] = [];
  for (const [role, account] of [["agent", agent], ["lecteur", readOnly]] as const) {
    const token = await tokenFor(browser, account);
    const ownerId = String(asRecord((await apiCall(await tokenFor(browser, world.owner), "GET", "/auth/me")).body).actorId);
    const list = await call(token, "GET", "/admin/users");
    const detail = await call(token, "GET", `/admin/users/${ownerId}`);
    lines.push(`${role} : liste ${list.status}, détail du propriétaire ${detail.status}`);
    expect(list.status, `${role} : GET /admin/users`).toBe(403);
    expect(detail.status, `${role} : GET /admin/users/:id`).toBe(403);
    for (const [name, result] of [["liste", list], ["détail", detail]] as const) {
      if (result.status === 200 && sensitive.test(result.text)) leaks.push(`${role}/${name}: ${[...new Set(result.text.match(new RegExp(sensitive.source, "gu")) ?? [])].join(",")}`);
    }
  }
  NOTE(`Réponses : ${lines.join(" | ")} ; champs sensibles exposés : ${leaks.join(" ; ") || "aucun"}`);
  expect(leaks, "aucun champ secret dans les réponses /admin/users destinées à un rôle courtier").toEqual([]);
});
