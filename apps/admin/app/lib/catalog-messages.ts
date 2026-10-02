/**
 * Spec 050: wording, allowlists and navigation helpers shared by the catalogue, consent text,
 * activation checklist and feature flag screens. Plain module (no "use server"): server actions,
 * server pages and client forms may all import it.
 *
 * The allowlists mirror `packages/shared/contracts/catalog.contracts.ts`; `satisfies` ties them to
 * the contract types and `apps/admin/tests/catalog-admin.spec.ts` checks they hold the same keys. The
 * API stays the authority: hiding a button here only spares the operator a refusal.
 */
import type {
  CountryCatalogToggleableFlag,
  ProductCatalogToggleableFlag
} from "../../../../packages/shared/contracts/catalog.contracts";
import type { AdminWriteBlocker, AdminWriteResult } from "./admin-api";

export const COUNTRY_TOGGLEABLE_FLAGS = [
  "country_public_enabled",
  "country_waitlist_enabled",
  "country_quote_enabled",
  "country_comparison_enabled",
  "country_broker_onboarding_enabled"
] as const satisfies readonly CountryCatalogToggleableFlag[];

export const PRODUCT_TOGGLEABLE_FLAGS = [
  "product_public_enabled",
  "product_quote_enabled",
  "product_comparison_enabled",
  "product_document_upload_enabled",
  "product_manual_review_required"
] as const satisfies readonly ProductCatalogToggleableFlag[];

export const SENSITIVE_FLAG_EXPLANATION = "Flag sensible : procédure de conformité. Non modifiable depuis le catalogue.";

export const FLAG_LABELS: Record<string, string> = {
  country_public_enabled: "Exposition publique du pays",
  country_waitlist_enabled: "Liste d'attente",
  country_quote_enabled: "Demande de devis",
  country_comparison_enabled: "Comparaison",
  country_broker_onboarding_enabled: "Inscription des courtiers",
  country_ai_enabled: "Assistance IA (pays)",
  product_public_enabled: "Exposition publique du produit",
  product_quote_enabled: "Demande de devis",
  product_comparison_enabled: "Comparaison",
  product_document_upload_enabled: "Dépôt de documents",
  product_sensitive_data_enabled: "Données sensibles",
  product_manual_review_required: "Revue manuelle obligatoire",
  product_ai_scoring_enabled: "Scoring IA",
  product_ai_form_assistant_enabled: "Assistant de formulaire IA"
};

export function flagLabel(key: string): string {
  return FLAG_LABELS[key] ?? key;
}

/** Flags whose activation exposes a surface to visitors: reserved to compliance (R4, R12). */
export const PUBLIC_ACTIVATION_FLAGS = new Set(["country_public_enabled"]);

export const PUBLIC_ACTIVATION_ROLES = ["compliance_admin", "super_admin"] as const;

/** Only `compliance_admin` and `super_admin` may open a country to the public or publish a consent text. */
export function canApprovePublicActivation(roles: readonly string[] | undefined): boolean {
  return (roles ?? []).some((role) => (PUBLIC_ACTIVATION_ROLES as readonly string[]).includes(role));
}

export const COUNTRY_STATUS_OPTIONS = ["draft", "internal", "partner_test", "pilot", "public", "suspended", "retired"] as const;
export const PRODUCT_STATUS_OPTIONS = ["draft", "internal", "pilot", "public", "suspended", "retired"] as const;
export const REGULATORY_FAMILY_OPTIONS = ["cima", "fanaf", "outside_cima", "future"] as const;
export const CONSENT_PURPOSE_OPTIONS = [
  "lead_transmission",
  "document_upload",
  "technical_notification",
  "ai_processing",
  "marketing_optional",
  "service_quality_survey"
] as const;
export const CONSENT_CHANNEL_OPTIONS = ["public_web", "admin", "broker", "api"] as const;
export const CONSENT_STATUS_OPTIONS = ["draft", "review", "published", "retired"] as const;
export const LANGUAGE_OPTIONS = ["fr", "en"] as const;

/** French labels of the FR-012 controls returned with 422 `CONSENT_TEXT_INVALID`. */
export const CONSENT_ISSUE_LABELS: Record<string, string> = {
  content_missing: "Contenu du texte absent : saisissez le texte complet avant publication.",
  content_hash_mismatch: "Empreinte incohérente avec le contenu : créez une nouvelle version.",
  forbidden_wording: "Formulation réglementée interdite détectée dans le texte.",
  recipient_variable_missing: "Le destinataire {{brokerName}} est absent du texte de transmission.",
  technical_role_missing: "Le rappel du rôle technique d'AssurMatch (ni courtier ni assureur) est absent."
};

export function blockerLabel(blocker: AdminWriteBlocker): string {
  return CONSENT_ISSUE_LABELS[blocker.control] ?? (blocker.label || blocker.control);
}

/**
 * Translates an API refusal into an operator message. 422 refusals keep their `blockers`, which the
 * screen lists separately; the message only says why the list is there.
 */
export function adminWriteErrorMessage(result: Pick<AdminWriteResult<unknown>, "status" | "code" | "message">): string {
  const code = result.code ?? "";
  if (result.status === 401 || code === "session_required" || code === "AUTH_REQUIRED") {
    return "Session expirée : reconnectez-vous puis recommencez.";
  }
  if (code === "MFA_REQUIRED") return "Vérification MFA requise avant cette action.";
  if (code === "CATALOG_FLAG_NOT_TOGGLEABLE") return SENSITIVE_FLAG_EXPLANATION;
  if (result.status === 403) return "Action refusée : droits insuffisants ou hors périmètre.";
  if (code === "CATALOG_UPDATE_CONFLICT") {
    return "Conflit de mise à jour : la fiche a été modifiée depuis son chargement. Rechargez la page puis recommencez.";
  }
  if (result.status === 409) {
    return "Conflit : cet élément existe déjà ou son état actuel ne permet pas cette action. Rechargez la page pour voir l'état à jour.";
  }
  if (code === "ACTIVATION_BLOCKED") {
    return "Activation refusée : la checklist d'activation a des contrôles bloquants. Corrigez-les puis recommencez.";
  }
  if (code === "QUOTE_FORM_REQUIRED") return "Activation refusée : aucun formulaire de devis publié pour ce pays et ce produit.";
  if (code === "CONSENT_TEXT_REQUIRED") return "Activation refusée : aucun texte de consentement de transmission publié pour ce pays.";
  if (code === "CONSENT_TEXT_INVALID") return "Publication refusée : le texte ne respecte pas les règles de consentement listées ci-dessous.";
  if (code === "REGULATORY_REGIME_INVALID") return "Régime réglementaire invalide ou retiré.";
  if (result.status === 422) return "Action refusée par une règle métier.";
  if (result.status === 404) return "Élément introuvable : il a peut-être été supprimé ou est hors périmètre.";
  if (result.status === 400 || code === "VALIDATION_FAILED") {
    return "Données invalides : vérifiez les champs saisis (le motif doit contenir au moins 8 caractères).";
  }
  if (result.status === 0) return "API indisponible : réessayez dans quelques instants.";
  return `Erreur inattendue de l'API (${result.status}${code ? ` ${code}` : ""}).`;
}

/** Same messages for the read helpers, which report `access_denied` / `api_<status>`. */
export function adminReadErrorMessage(error: string | undefined): string {
  if (error === "access_denied") return "Accès refusé : droits insuffisants ou hors périmètre.";
  if (error === "session_required" || error === "session_expired") return "Session admin requise.";
  if (error === "api_404") return "Élément introuvable.";
  return `Données indisponibles (${error ?? "erreur inconnue"}).`;
}

/* ---------------------------------------------------------------------------------------------
 * "Corriger" links: every failing activation control points at the screen that fixes it. They are
 * plain GET links; nothing here mutates anything.
 * ------------------------------------------------------------------------------------------- */

export interface CorrectionScope {
  countryId?: string | null | undefined;
  productId?: string | null | undefined;
}

export interface CorrectionTarget {
  href: string;
  /** Extra hint when the fix lives in a later spec. */
  note?: string;
}

/** Reads the ids carried by a checklist section key (`country:<id>`, `product:<id>`, `quote:<c>:<p>`, `partner:<pa>:<c>:<p>`). */
export function scopeFromSection(section: string): CorrectionScope {
  const [kind, first, second, third] = section.split(":");
  if (kind === "country") return { countryId: first };
  if (kind === "product") return { productId: first };
  if (kind === "quote") return { countryId: first, productId: second };
  if (kind === "partner") return { countryId: second, productId: third };
  return {};
}

const GLOBAL_FLAG_CONTROLS = new Set(["public_comparator_enabled", "quote_request_enabled", "sponsored_offers_enabled"]);

export function correctionTarget(control: string, scope: CorrectionScope): CorrectionTarget | undefined {
  const countryPage = scope.countryId ? `/catalog/countries/${encodeURIComponent(scope.countryId)}` : "/catalog/countries";
  if (control === "country_active_licensed_partner" || control.startsWith("partner_")) {
    return { href: "/partners", note: "Licences et autorisations partenaires : spec 051" };
  }
  if (control.startsWith("country_")) return { href: countryPage };
  if (control === "product_country_association") return { href: scope.countryId ? `${countryPage}#liaisons` : "/catalog/products" };
  if (control.startsWith("product_")) {
    // Effective product flags are read per country link: with a country in context, the link section is the fix.
    if (scope.countryId) return { href: `${countryPage}#liaisons` };
    return { href: scope.productId ? `/catalog/products/${encodeURIComponent(scope.productId)}` : "/catalog/products" };
  }
  if (control === "published_quote_form") return { href: "/quote-form-definitions" };
  if (control === "published_consent_text") {
    const params = new URLSearchParams();
    if (scope.countryId) params.set("countryId", scope.countryId);
    if (scope.productId) params.set("productId", scope.productId);
    const query = params.toString();
    return { href: `/consent-texts${query ? `?${query}` : ""}` };
  }
  if (control === "publishable_offer" || control === "no_blocked_active_offer") return { href: "/offers" };
  if (GLOBAL_FLAG_CONTROLS.has(control) || control.endsWith("_enabled")) return { href: "/feature-flags" };
  return undefined;
}

/* ---------------------------------------------------------------------------------------------
 * Feature flag sensitivity. Mirrors `isSensitiveFeatureFlagKey` of
 * `backend/src/modules/feature-flags/sensitive-feature-flag-policy.ts`; a sensitive flag is always
 * read-only here, whatever the backend would accept.
 * ------------------------------------------------------------------------------------------- */

const AI_FLAGS_WITH_EXPLICIT_POLICY = new Set(["ai_summary_enabled", "ai_partner_opt_out"]);

export const EXPLICITLY_SENSITIVE_FLAG_KEYS = [
  "payments_enabled",
  "e_signature_enabled",
  "policy_issuance_enabled",
  "claims_enabled",
  "insurer_api_enabled",
  "ai_recommendation_enabled",
  "ai_lead_scoring_enabled",
  "ai_duplicate_detection_enabled",
  "ai_broker_assistant_enabled",
  "multi_broker_routing_enabled",
  "billing_enabled",
  "sms_enabled",
  "whatsapp_enabled",
  "partner_api_enabled",
  "partner_webhooks_enabled",
  "retention_purge_enabled",
  "satisfaction_survey_enabled",
  "ai_routing_anomaly_detection_enabled"
] as const;

const REGULATED_FLAG_KEY_FRAGMENTS = [
  "payment",
  "premium",
  "e_signature",
  "signature",
  "policy_issuance",
  "policy_issue",
  "contract_issuance",
  "attestation",
  "claim",
  "insurer_api",
  "insurer",
  "webhook"
];

export function isSensitiveFlagKey(key: string, extraSensitiveKeys: readonly string[] = []): boolean {
  const normalized = key.trim().toLowerCase();
  if ((EXPLICITLY_SENSITIVE_FLAG_KEYS as readonly string[]).includes(normalized) || extraSensitiveKeys.includes(normalized)) return true;
  if (normalized.startsWith("ai_") && !AI_FLAGS_WITH_EXPLICIT_POLICY.has(normalized)) return true;
  return REGULATED_FLAG_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export function formatDate(value?: string | null): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "-";
}
