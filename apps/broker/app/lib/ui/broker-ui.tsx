/**
 * Point d'entree UI du back-office courtier.
 *
 * Le design system vit dans `@assurmatch/ui/backoffice` et ne porte ni route, ni regle d'acces, ni
 * vocabulaire metier. Ce module ne fait que le reexporter et y ajouter les tables de libelles
 * courtier passees a `StatusBadge`, pour que le vocabulaire des statuts reste celui du contrat.
 */

import type { ReactNode } from "react";
import { CRM_STATUS_LABELS, STARTER_STATUS_LABELS } from "../lead-vocabulary";

export * from "@assurmatch/ui/backoffice";

/** Libelles Starter (assigne, vu, accepte, rejete, conteste, cloture) pour `StatusBadge`. */
export const starterStatusLabels: Record<string, string> = STARTER_STATUS_LABELS;

/** Libelles des 15 statuts de pipeline CRM pour `StatusBadge`. */
export const crmStatusLabels: Record<string, string> = CRM_STATUS_LABELS;

/**
 * Spec 051 FR-021: write area of a suspended partner. A disabled `fieldset` disables every control
 * inside it (inputs, submit buttons and dialog triggers), without JavaScript. The API refuses the
 * write anyway (403 `PARTNER_SUSPENDED`).
 */
export function TenantWriteGuard({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
  if (!readOnly) return <>{children}</>;
  return (
    <fieldset disabled data-tenant-read-only="true" aria-label="Actions indisponibles : compte suspendu" style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      {children}
    </fieldset>
  );
}
