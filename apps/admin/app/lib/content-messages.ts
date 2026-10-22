/**
 * Spec 072: wording and small pure helpers of the "Contenu" screens (minimal CMS). Plain module (no
 * "use server"): server pages, server actions and client forms may all import it. The API stays the
 * authority on permissions and transitions; the helpers here only decide what to show.
 */
import type {
  ContentCapabilitiesView,
  ContentCmsLocale,
  ContentEntryView,
  ContentKind,
  ContentLegalSlug,
  ContentStatus
} from "../../../../packages/shared/contracts/content-cms.contracts";

export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  faq: "Question de la FAQ",
  guide: "Guide",
  glossary: "Terme du glossaire",
  legal_override: "Surcharge légale (pays)"
};

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "Brouillon",
  pending_review: "En attente de validation",
  published: "Publié",
  archived: "Archivé"
};

export const CONTENT_LOCALE_LABELS: Record<ContentCmsLocale, string> = {
  fr: "Français",
  en: "English"
};

export const CONTENT_LEGAL_SLUG_LABELS: Record<ContentLegalSlug, string> = {
  "legal-notice": "Mentions légales (legal-notice)",
  privacy: "Confidentialité (privacy)",
  cookies: "Cookies (cookies)",
  terms: "Conditions d'utilisation (terms)"
};

export const PLAIN_TEXT_HELP = "Texte brut, pas de HTML : les signes < et > sont refusés. Chaque valeur est affichée telle quelle sur le site public.";
export const FOUR_EYES_HELP = "Un second acteur doit approuver : vous ne pouvez pas approuver votre propre soumission.";
export const LEGAL_APPROVAL_HELP = "Une surcharge légale est approuvée par la conformité (compliance_admin) ou un super administrateur.";

export const CONTENT_STATUS_TONES: Record<string, "neutral" | "warning" | "success" | "disabled"> = {
  draft: "neutral",
  pending_review: "warning",
  published: "success",
  archived: "disabled"
};

export function contentKindLabel(kind: string): string {
  return CONTENT_KIND_LABELS[kind as ContentKind] ?? kind;
}

export function contentStatusLabel(status: string): string {
  return CONTENT_STATUS_LABELS[status as ContentStatus] ?? status;
}

export function contentLocaleLabel(locale: string): string {
  return CONTENT_LOCALE_LABELS[locale as ContentCmsLocale] ?? locale;
}

export function contentDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "-";
}

export function isContentKind(value: string): value is ContentKind {
  return value === "faq" || value === "guide" || value === "glossary" || value === "legal_override";
}

/** Message shown when a read of the content API fails. */
export function contentReadErrorMessage(error: string | undefined): string {
  if (!error) return "Contenu indisponible.";
  if (error === "access_denied") return "Accès à la gestion du contenu refusé pour ce rôle (réservé aux rôles contenu, conformité et super administrateur).";
  if (error === "session_required" || error === "session_expired") return "Session admin requise.";
  return `Contenu indisponible (${error}).`;
}

interface ErrorLike {
  status?: number;
  code?: string;
  message?: string;
}

/** Converts an API error (`{ code, message }`, statuses 400/403/404/409/422) into a readable French message. */
export function contentErrorMessage(error: unknown): string {
  const e: ErrorLike = typeof error === "object" && error !== null ? error as ErrorLike : {};
  const code = e.code ?? "";
  const raw = typeof e.message === "string" ? e.message : error instanceof Error ? error.message : "";
  if (code === "session_required" || raw === "session_required") return "Session admin requise : reconnectez-vous.";
  if (code === "session_expired" || raw === "session_expired") return "Session expirée : reconnectez-vous.";
  if (code === "FORBIDDEN_WORDING") {
    return `Formulation interdite détectée${raw && raw !== code ? ` (${raw})` : ""}. Reformulez le texte : pas de promesse, de garantie ni de vocabulaire réglementé non autorisé.`;
  }
  if (code === "RBAC_DENIED" || e.status === 403) {
    if (/own|self|propre|same|different/i.test(raw)) return "Vous ne pouvez pas approuver votre propre soumission : un autre acteur doit s'en charger.";
    return "Action refusée pour votre rôle. Une surcharge légale ne peut être approuvée que par la conformité ou un super administrateur.";
  }
  if (e.status === 404) return "Contenu introuvable (il a peut-être été remplacé). Revenez à la liste.";
  if (e.status === 409) {
    return "Conflit : ce contenu a été modifié entre-temps ou cette transition n'est plus possible dans l'état actuel (une version est peut-être déjà ouverte ou publiée pour cette clé). Rechargez la page.";
  }
  if (e.status === 400 || e.status === 422) {
    return `Contenu refusé par les règles de validation${raw && raw !== code ? ` : ${raw}` : ""}. Vérifiez les champs et rappelez-vous : texte brut, longueurs bornées.`;
  }
  if (raw === "access_denied") return "Accès refusé.";
  if (raw.startsWith("form_")) return raw.slice(5);
  return raw ? `Action impossible (${raw}).` : "Action impossible.";
}

export type ContentAction = "edit" | "submit" | "withdraw" | "approve" | "reject" | "archive" | "revise";

/**
 * What the signed-in admin may be offered for an entry: capabilities AND status. The API remains the
 * authority; `viewerId` (when known) hides the approval of one's own submission.
 */
export function availableContentActions(entry: ContentEntryView, caps: ContentCapabilitiesView, viewerId?: string): ContentAction[] {
  const actions: ContentAction[] = [];
  const canDecide = caps.canApprove && (entry.kind !== "legal_override" || caps.canApproveLegal);
  if (entry.status === "draft") {
    if (caps.canEdit) actions.push("edit", "submit");
    if (caps.canApprove) actions.push("archive");
  } else if (entry.status === "pending_review") {
    if (caps.canEdit) actions.push("withdraw");
    const ownSubmission = viewerId !== undefined && entry.submittedById === viewerId;
    if (canDecide && !ownSubmission) actions.push("approve", "reject");
  } else if (entry.status === "published") {
    if (caps.canEdit) actions.push("revise");
    if (caps.canApprove) actions.push("archive");
  }
  return actions;
}
