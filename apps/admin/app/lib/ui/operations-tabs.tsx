/**
 * Sub-screens of the Operations group, in the same order as the sidebar sub-entries.
 *
 * The sidebar already lists them under the active Operations entry, so a second row of tabs would
 * only repeat the navigation: the component renders nothing. Each screen keeps declaring its place
 * so the list below stays the single source the sidebar mirrors.
 */
export const operationsTabs = [
  { label: "Opérations techniques", href: "/operations" },
  { label: "Demandes de devis", href: "/quote-requests" },
  { label: "Assignations", href: "/lead-assignments" },
  { label: "Prospects", href: "/prospects" },
  { label: "Revue devis", href: "/operations/quote-review" },
  // Spec 056 (H-04): contact inbox.
  { label: "Messages de contact", href: "/operations/contact-messages" }
];

export function OperationsTabs({ current }: { current: string }) {
  void current;
  return null;
}
