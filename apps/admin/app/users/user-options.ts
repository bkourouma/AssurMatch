export const adminRoleOptions = [
  "super_admin",
  "admin_pays",
  "compliance_admin",
  "support_admin",
  "finance_admin",
  "content_admin",
  "ai_admin",
  "broker_owner_starter",
  "broker_owner_pro",
  "broker_manager",
  "broker_agent",
  "broker_read_only"
];

export const userStatusOptions = ["invited", "active", "suspended", "locked", "deleted"];

export const USER_STATUS_LABELS: Record<string, string> = {
  invited: "Invité",
  active: "Actif",
  suspended: "Suspendu",
  locked: "Verrouillé",
  deleted: "Supprimé"
};

export function userStatusLabel(status: string): string {
  return USER_STATUS_LABELS[status] ?? status;
}

/** Plain wording of the lifecycle actions; the action codes themselves stay the submitted values. */
export const USER_ACTION_LABELS: Record<string, string> = {
  suspend: "Suspendre le compte",
  unsuspend: "Réactiver le compte suspendu",
  lock: "Verrouiller le compte",
  unlock: "Déverrouiller le compte",
  "mfa-reset": "Réinitialiser le MFA",
  delete: "Supprimer le compte"
};

/** Readable form of the `?notice=` value set by the user actions. */
export const USER_NOTICE_LABELS: Record<string, string> = {
  profile_updated: "profil mis à jour",
  roles_updated: "rôles mis à jour",
  suspend: "compte suspendu",
  unsuspend: "compte réactivé",
  lock: "compte verrouillé",
  unlock: "compte déverrouillé",
  "mfa-reset": "MFA réinitialisé",
  delete: "compte supprimé"
};

export function userNoticeLabel(notice: string): string {
  return USER_NOTICE_LABELS[notice] ?? notice;
}

/** « Statut : X, prochaine étape : Y » of the account detail header. */
export function userNextStep(status: string): string {
  switch (status) {
    case "invited":
      return "l'utilisateur doit activer son compte avec le jeton reçu. Rien à faire de votre côté.";
    case "active":
      return "aucune action en attente. Les actions sensibles (suspension, MFA, mot de passe) sont dans l'onglet « Actions sensibles ».";
    case "suspended":
      return "Réactiver le compte (onglet « Actions sensibles ») une fois la raison de la suspension levée.";
    case "locked":
      return "Déverrouiller le compte (onglet « Actions sensibles ») après vérification de l'identité de l'utilisateur.";
    case "deleted":
      return "aucune, le compte est supprimé.";
    default:
      return "consulter le profil et les rôles du compte.";
  }
}
