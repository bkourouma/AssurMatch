import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourcesUnder(full) : [full];
  });
}

test("the admin API client targets the /admin/content routes", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");

  for (const name of [
    "readContentCapabilities",
    "readContentEntries",
    "readContentEntry",
    "readContentHistory",
    "createContentEntry",
    "updateContentEntry",
    "submitContentEntry",
    "withdrawContentEntry",
    "approveContentEntry",
    "rejectContentEntry",
    "archiveContentEntry",
    "reviseContentEntry"
  ]) {
    expect(api).toContain(`function ${name}`);
  }
  expect(api).toContain("/admin/content/capabilities");
  expect(api).toContain("/admin/content/entries");
  for (const suffix of ["/history", "/submit", "/withdraw", "/revise", "/approve", "/reject", "/archive"]) {
    expect(api).toContain(`"${suffix}"`);
  }
  expect(api).toContain("content-cms.contracts");
});

test("the content screens expose the list, the filters, the creation link and the detail", () => {
  const list = source("apps/admin/app/content/page.tsx");
  const detail = source("apps/admin/app/content/[id]/page.tsx");
  const messages = source("apps/admin/app/lib/content-messages.ts");

  expect(list).toContain("Nouveau contenu");
  expect(list).toContain("/content/new");
  for (const label of ["Type", "Langue", "Statut", "Pays"]) expect(list).toContain(`label="${label}`);
  expect(detail).toContain("Historique des versions");
  expect(detail).toContain("Note de décision");
  expect(detail).toContain("Soumis par");
  expect(detail).toContain("Décidé par");
  expect(detail).toContain("Créé par");
  for (const kind of ["Question de la FAQ", "Guide", "Terme du glossaire", "Surcharge légale"]) expect(messages).toContain(kind);
  for (const status of ["Brouillon", "En attente de validation", "Publié", "Archivé"]) expect(messages).toContain(status);
});

test("the workflow buttons exist, with a mandatory reason to reject and archive", () => {
  const forms = source("apps/admin/app/content/content-forms.tsx");
  const actions = source("apps/admin/app/content/actions.ts");

  for (const label of ["Soumettre", "Retirer", "Approuver", "Rejeter", "Archiver", "Créer une nouvelle version", "Enregistrer le brouillon"]) {
    expect(forms).toContain(label);
  }
  expect(forms).toContain("Motif (obligatoire, audité)");
  expect(actions).toContain("Un motif est obligatoire");
  expect(actions).toContain("approveContentEntry");
  expect(actions).toContain("reviseContentEntry");
});

test("the capabilities and the status decide which buttons are shown", () => {
  const messages = source("apps/admin/app/lib/content-messages.ts");
  const detail = source("apps/admin/app/content/[id]/page.tsx");

  expect(messages).toContain("availableContentActions");
  expect(messages).toContain("caps.canEdit");
  expect(messages).toContain("caps.canApprove");
  expect(messages).toContain("caps.canApproveLegal");
  expect(detail).toContain("availableContentActions(entry, caps, viewerId)");
});

test("the server actions revalidate the content screens", () => {
  const actions = source("apps/admin/app/content/actions.ts");

  expect(actions).toContain("revalidatePath(\"/content\")");
  expect(actions.match(/revalidatePath\("\/content"\)/g)?.length).toBeGreaterThanOrEqual(2);
});

test("the editorial help states plain text, the second approver and the legal approvers", () => {
  const messages = source("apps/admin/app/lib/content-messages.ts");
  const forms = source("apps/admin/app/content/content-forms.tsx");

  expect(messages).toContain("Texte brut, pas de HTML");
  expect(messages).toContain("Un second acteur doit approuver");
  expect(messages).toContain("vous ne pouvez pas approuver votre propre soumission");
  expect(messages).toContain("conformité");
  expect(messages).toContain("super administrateur");
  expect(forms).toContain("PLAIN_TEXT_HELP");
  expect(forms).toContain("FOUR_EYES_HELP");
  expect(forms).toContain("LEGAL_APPROVAL_HELP");
});

test("API errors are converted into readable French messages", () => {
  const messages = source("apps/admin/app/lib/content-messages.ts");

  expect(messages).toContain("FORBIDDEN_WORDING");
  expect(messages).toContain("RBAC_DENIED");
  expect(messages).toContain("e.status === 409");
  expect(messages).toContain("e.status === 422");
  expect(messages).toContain("Formulation interdite détectée");
});

test("the forms are plain text fields per kind, without a rich editor", () => {
  const forms = source("apps/admin/app/content/content-forms.tsx");
  const payload = source("apps/admin/app/content/content-payload.ts");

  for (const field of ["faq_question", "faq_answer", "guide_title", "guide_sections", "glossary_term", "glossary_definition", "legal_sections", "legal_placeholders"]) {
    expect(forms).toContain(field);
  }
  expect(forms).toContain("legalSlug");
  expect(forms).toContain("CONTENT_LEGAL_SLUG_LABELS");
  expect(forms).toContain("CONTENT_LOCALE_LABELS");
  // Block format (one marker per line start), never a character separator inside a paragraph:
  // the round trip is unit tested in apps/admin/tests/unit/content-payload.test.ts.
  expect(payload).toContain("« # identifiant »");
  expect(payload).not.toContain('split("|")');
  expect(forms).toContain("SECTIONS_HELP");
});

test("the menu links to the content section", () => {
  const shell = source("apps/admin/app/lib/ui/admin-shell.tsx");

  expect(shell).toContain("href: \"/content\"");
  expect(shell).toContain("Contenu");
});

test("content is never rendered as markup and nothing mentions artificial intelligence", () => {
  const files = sourcesUnder("apps/admin/app/content").concat("apps/admin/app/lib/content-messages.ts");

  for (const path of files) {
    const content = source(path);
    expect(content, path).not.toContain("dangerouslySetInnerHTML");
    expect(content, path).not.toMatch(/\bIA\b|\bAI\b/);
    expect(content, path).not.toMatch(/intelligence artificielle/i);
  }
});
