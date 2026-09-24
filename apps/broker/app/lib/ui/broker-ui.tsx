/**
 * Point d'entree UI du back-office courtier.
 *
 * Le design system vit dans `@assurmatch/ui/backoffice` et ne porte ni route, ni regle d'acces, ni
 * vocabulaire metier. Ce module ne fait que le reexporter et y ajouter les tables de libelles
 * courtier passees a `StatusBadge`, pour que le vocabulaire des statuts reste celui du contrat.
 */

import { CRM_STATUS_LABELS, STARTER_STATUS_LABELS } from "../lead-vocabulary";

export * from "@assurmatch/ui/backoffice";

/** Libelles Starter (assigne, vu, accepte, rejete, conteste, cloture) pour `StatusBadge`. */
export const starterStatusLabels: Record<string, string> = STARTER_STATUS_LABELS;

/** Libelles des 15 statuts de pipeline CRM pour `StatusBadge`. */
export const crmStatusLabels: Record<string, string> = CRM_STATUS_LABELS;
