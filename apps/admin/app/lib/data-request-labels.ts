import type { NoticeTone, Tone } from "./ui/admin-ui";

/** Spec 062: French wording of the data-request queue (types, statuses, history actions, notices). */

export const DATA_REQUEST_TYPE_LABELS: Record<string, string> = {
  access: "Accès",
  rectification: "Rectification",
  erasure: "Effacement"
};

export const DATA_REQUEST_STATUS_LABELS: Record<string, { tone: Tone; label: string }> = {
  received: { tone: "info", label: "Reçue" },
  in_review: { tone: "warning", label: "En cours d'examen" },
  completed: { tone: "success", label: "Traitée" },
  rejected: { tone: "danger", label: "Rejetée" }
};

export const DATA_REQUEST_HISTORY_LABELS: Record<string, string> = {
  created: "Demande reçue",
  taken: "Prise en charge",
  completed: "Clôturée (traitée)",
  rejected: "Clôturée (rejetée)",
  erasure_started: "Aperçu d'effacement créé"
};

export const DATA_REQUEST_NOTICES: Record<string, { tone: NoticeTone; text: string }> = {
  taken: { tone: "info", text: "Demande prise en charge : elle est maintenant en cours d'examen." },
  completed: { tone: "success", text: "Demande clôturée comme traitée. Le visiteur reçoit un e-mail de clôture qui renvoie vers son espace." },
  rejected: { tone: "info", text: "Demande rejetée avec une note interne. Le visiteur reçoit un e-mail de clôture qui renvoie vers son espace." },
  erasure_started: {
    tone: "info",
    text: "Aperçu d'effacement créé (spec 046) : rien n'a été effacé. Le lot doit être approuvé puis exécuté dans « Conservation des données »."
  },
  note_required: { tone: "warning", text: "Une note interne est obligatoire pour rejeter une demande." },
  note_too_long: { tone: "warning", text: "Note trop longue : 1 000 caractères au plus." },
  confirmation_required: { tone: "warning", text: "Confirmez que vous avez compris que cette action ne crée qu'un aperçu d'effacement." },
  invalid: { tone: "warning", text: "Saisie ou demande invalide : vérifiez les informations puis réessayez." },
  forbidden: { tone: "danger", text: "Action refusée : MFA vérifiée et rôle de conformité requis (refus audité)." },
  not_found: { tone: "warning", text: "Demande introuvable." },
  conflict: { tone: "warning", text: "Transition impossible : la demande a déjà été traitée ou n'est plus dans l'état attendu." },
  error: { tone: "danger", text: "Service des demandes de données temporairement indisponible." }
};

/** Text shown before the start-erasure button: states plainly that nothing is erased by it. */
export const START_ERASURE_CONFIRMATION =
  "Cette action crée un aperçu d'effacement (spec 046). Rien n'est effacé tant qu'un lot n'est pas approuvé puis exécuté dans « Conservation des données ».";

export function formatDataRequestDate(value: string | null | undefined): string {
  return value ? value.slice(0, 16).replace("T", " ") : "—";
}
