import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

/**
 * Spec 062 (admin surface): data-request queue, read-only conversations card, SLA "first visible
 * reply" columns, messaging flag label, retention labels. Source-marker specs: the API is not mocked.
 */

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const LIST_PAGE = "apps/admin/app/compliance/data-requests/page.tsx";
const DETAIL_PAGE = "apps/admin/app/compliance/data-requests/[id]/page.tsx";
const ACTIONS = "apps/admin/app/lib/data-request-actions.ts";
const LABELS = "apps/admin/app/lib/data-request-labels.ts";
const CONVERSATIONS_CARD = "apps/admin/app/quote-requests/[quoteRequestId]/lead-conversations-card.tsx";

test("data-request pages exist and read the protected admin API (spec 062)", () => {
  expect(existsSync(LIST_PAGE)).toBe(true);
  expect(existsSync(DETAIL_PAGE)).toBe(true);
  const api = source("apps/admin/app/lib/admin-api.ts");

  expect(api).toContain("export function readDataRequests");
  expect(api).toContain("export function readDataRequest(");
  expect(api).toContain("/admin/data-requests");
  expect(api).toContain("/admin/leads/${encodeURIComponent(quoteRequestId)}/conversations");
  expect(source(LIST_PAGE)).toContain("readDataRequests");
  expect(source(DETAIL_PAGE)).toContain("readDataRequest(id)");
});

test("data-request list filters by status and type and shows reference, dates and the overdue badge", () => {
  const page = source(LIST_PAGE);

  expect(page).toContain('name="status"');
  expect(page).toContain('name="type"');
  expect(page).toContain("params.cursor");
  expect(page).toContain("Page suivante");
  expect(page).toContain("En retard");
  expect(page).toContain("item.reference");
  expect(page).toContain("dueAt");
  // The list never renders the visitor's free text.
  expect(page).not.toMatch(/item\.detail/);
  expect(page).toContain("Accès refusé");
});

test("data-request actions call the right endpoints and reject requires a note", () => {
  const actions = source(ACTIONS);

  expect(actions).toContain('"use server"');
  for (const action of ["takeDataRequest", "completeDataRequest", "rejectDataRequest", "startDataRequestErasure"]) {
    expect(actions).toContain(`export async function ${action}`);
  }
  expect(actions).toContain("/admin/data-requests/${id}/${action}");
  for (const endpoint of ['"take"', '"complete"', '"reject"', '"start-erasure"']) {
    expect(actions).toContain(endpoint);
  }
  // Reject: note mandatory, checked before the API call.
  const reject = actions.slice(actions.indexOf("export async function rejectDataRequest"), actions.indexOf("export async function startDataRequestErasure"));
  expect(reject).toContain('note.length === 0');
  expect(reject).toContain('"note_required"');
  expect(reject.indexOf("note_required")).toBeLessThan(reject.indexOf("runAction"));
  // The detail page marks the reject note as required on the client side too.
  expect(source(DETAIL_PAGE)).toMatch(/id="dr-reject-note"[^>]*required/);
  // Complete: note optional.
  expect(actions.slice(actions.indexOf("export async function completeDataRequest"), actions.indexOf("export async function rejectDataRequest"))).not.toContain("note_required");
});

test("start-erasure only creates the erasure preview and says so before the click", () => {
  const labels = source(LABELS);
  const page = source(DETAIL_PAGE);
  const actions = source(ACTIONS);

  expect(labels).toContain("Cette action crée un aperçu d'effacement (spec 046). Rien n'est effacé tant qu'un lot n'est pas approuvé puis exécuté dans « Conservation des données ».");
  expect(page).toContain("START_ERASURE_CONFIRMATION");
  expect(page).toContain('data-data-request-marker="erasure-confirmation"');
  expect(page).toContain('name="acknowledge"');
  expect(page).toContain("action={startDataRequestErasure}");
  // Erasure is only offered for the erasure type, and the server action demands the acknowledgment.
  expect(page).toContain('request?.type === "erasure"');
  expect(actions).toContain('stringValue(formData.get("acknowledge")) !== "yes"');
  // No approval or execution from this screen: it never calls the retention approve endpoint.
  for (const file of [ACTIONS, DETAIL_PAGE, LIST_PAGE]) {
    expect(source(file)).not.toContain("/approve");
    expect(source(file)).not.toContain("approveBatch");
  }
  expect(page).toContain('href="/compliance/retention"');
  expect(page).toContain("erasureBatchId");
});

test("data-request redirects carry a notice key only, never personal data", () => {
  const actions = source(ACTIONS);

  expect(actions).not.toMatch(/redirect\(`[^`]*\$\{note/);
  expect(actions).not.toMatch(/detailUrl\([^)]*note[,)]/);
  expect(actions).not.toMatch(/detailUrl\([^)]*detail/);
  expect(actions).not.toMatch(/searchParams[^;]*email/);
  expect(actions).toContain("?notice=${encodeURIComponent(notice)}");
  const page = source(DETAIL_PAGE);
  expect(page).not.toMatch(/\{[^}]*\.email\b/);
  expect(page).not.toMatch(/searchParams[^;]*detail/);
});

test("support role sees a masked detail and the page is read-only for non-deciding roles", () => {
  const page = source(DETAIL_PAGE);

  expect(page).toContain('data-data-request-marker="detail-masked"');
  expect(page).toContain("masqué pour votre rôle (support)");
  expect(page).toContain('"compliance_admin", "super_admin"');
  expect(page).toContain("canDecide");
  expect(page).toContain("result?.forbidden");
});

test("data-request navigation, compliance and retention pages link to the queue", () => {
  expect(source("apps/admin/app/lib/ui/admin-shell.tsx")).toContain('"/compliance/data-requests"');
  expect(source("apps/admin/app/compliance/page.tsx")).toContain('href="/compliance/data-requests"');
  expect(source("apps/admin/app/compliance/retention/page.tsx")).toContain('href="/compliance/data-requests"');
  expect(source("apps/admin/app/compliance/retention/page.tsx")).toContain("Demandes de données des visiteurs");
});

test("conversations card is read-only, audited, masked for support and mounted on the quote request page", () => {
  const card = source(CONVERSATIONS_CARD);

  expect(card).toContain("Échanges courtier / visiteur");
  expect(card).toContain("readAdminLeadConversations(quoteRequestId)");
  expect(card).toContain("Contenu masqué pour votre rôle (support)");
  expect(card).toContain('data-conversation-marker="body-masked"');
  expect(card).toContain("noms uniquement");
  expect(card).toContain("journal d'audit");
  // Read-only: no form, no input, no server action, no write endpoint.
  expect(card).not.toMatch(/<(form|Form|Textarea|textarea|input|Input|Button)\b/);
  expect(card).not.toContain("use server");
  expect(card).not.toMatch(/method:\s*"(POST|PATCH|DELETE)"/);
  // Attachments: names only, no download link.
  expect(card).not.toMatch(/href=\{[^}]*attachment/);
  expect(source("apps/admin/app/quote-requests/[quoteRequestId]/page.tsx")).toContain("<LeadConversationsCard quoteRequestId={quoteRequestId} />");
  expect(source("apps/admin/app/lib/admin-api.ts")).not.toMatch(/writeAdmin[^;]*conversations/);
});

test("partner SLA shows the first visible reply columns and falls back to a dash", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const partners = source("apps/admin/app/partners/page.tsx");
  const partner = source("apps/admin/app/partners/[partnerId]/page.tsx");

  for (const field of ["averageFirstVisibleReplyMinutes", "firstVisibleReplyMeasured", "firstVisibleReplyWithinTarget", "firstVisibleReplyComplianceRate"]) {
    expect(api).toContain(field);
  }
  expect(partners).toContain("Première réponse visible");
  expect(partners).toContain("firstVisibleReplyComplianceRate");
  expect(partners).toContain('"—"');
  expect(partner).toContain("Première réponse visible (30 j)");
  // The existing "first action" columns are unchanged.
  expect(partners).toContain("averageFirstActionMinutes");
  expect(partners).toContain('header: "Taux"');
});

test("messaging feature flag has a French label and stays a normal, non-sensitive global flag", () => {
  const messages = source("apps/admin/app/lib/catalog-messages.ts");

  expect(messages).toContain('broker_visitor_messaging_enabled: "Messagerie courtier ↔ visiteur"');
  expect(messages).toContain("Autorise l'envoi de messages et de demandes de documents ; l'historique reste lisible lorsqu'elle est coupée.");
  const sensitive = messages.slice(messages.indexOf("EXPLICITLY_SENSITIVE_FLAG_KEYS"), messages.indexOf("REGULATED_FLAG_KEY_FRAGMENTS"));
  expect(sensitive).not.toContain("broker_visitor_messaging_enabled");
  expect(source("apps/admin/app/lib/ui/admin-view-models.ts")).not.toContain("broker_visitor_messaging_enabled");
  expect(source("apps/admin/app/feature-flags/page.tsx")).toContain("flagDescription(flag.key)");
});

test("retention labels cover the spec 062 categories with the provisional-duration mention", () => {
  const api = source("apps/admin/app/lib/admin-api.ts");
  const page = source("apps/admin/app/compliance/retention/page.tsx");

  for (const category of ["satisfaction_feedback", "lead_message_threads", "lead_document_requests", "data_requests"]) {
    expect(api).toContain(`"${category}"`);
    expect(page).toContain(`${category}:`);
  }
  expect(api).toContain('"submitted_at"');
  expect(page).toContain("submitted_at:");
  expect(page).toContain("Fils de messages courtier/visiteur");
  expect(page).toContain("Demandes de documents");
  expect(page).toContain("Demandes de données personnelles");
  expect(page).toContain("durée provisoire, en attente de validation juridique");
  expect(page).toContain('data-retention-marker="provisional-duration"');
  // No duplicated key in the label map (a duplicate silently overrides the first label).
  const labels = page.slice(page.indexOf("const CATEGORY_LABELS"), page.indexOf("const PROVISIONAL_CATEGORIES"));
  const keys = [...labels.matchAll(/^\s{2}([a-z_]+):/gm)].map((match) => match[1]);
  expect(new Set(keys).size).toBe(keys.length);
});

test("admin copy of the retention categories matches the shared contract", () => {
  const contract = source("packages/shared/contracts/data-retention.contracts.ts");
  const api = source("apps/admin/app/lib/admin-api.ts");
  const contractBlock = contract.slice(contract.indexOf("RETENTION_CATEGORIES = ["), contract.indexOf("] as const"));
  const apiBlock = api.slice(api.indexOf("RETENTION_CATEGORY_KEYS = ["), api.indexOf("] as const", api.indexOf("RETENTION_CATEGORY_KEYS = [")));
  const keys = (block: string) => [...block.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);

  expect(keys(apiBlock)).toEqual(keys(contractBlock));
});

test("spec 062 admin surfaces avoid sale, subscription and regulated wording", () => {
  for (const file of [LIST_PAGE, DETAIL_PAGE, ACTIONS, LABELS, CONVERSATIONS_CARD]) {
    const text = source(file).toLowerCase();
    for (const forbidden of ["acheter", "souscrire", "payer maintenant", "contrat valide", "garantie acceptee", "garantie acceptée", "meilleure assurance", "meilleur prix"]) {
      expect(text).not.toContain(forbidden);
    }
  }
});

test("new spec 062 admin strings keep their French accents", () => {
  const text = [LIST_PAGE, DETAIL_PAGE, LABELS, CONVERSATIONS_CARD].map(source).join("\n");

  for (const accented of ["Référence", "Échéance indicative", "Reçue", "Traitée", "Rejetée", "Conformité", "masqué"]) {
    expect(text).toContain(accented);
  }
  expect(text).not.toContain("Echeance");
});
