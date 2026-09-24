import { Tabs } from "./admin-ui";

/** Sub-screens of the Operations group, in the same order as the sidebar sub-entries. */
const operationsTabs = [
  { label: "Operations techniques", href: "/operations" },
  { label: "Demandes de devis", href: "/quote-requests" },
  { label: "Assignations", href: "/lead-assignments" },
  { label: "Prospects", href: "/prospects" },
  { label: "Revue devis", href: "/operations/quote-review" }
];

export function OperationsTabs({ current }: { current: string }) {
  return (
    <Tabs
      label="Sections operations"
      items={operationsTabs.map((tab) => ({ ...tab, current: tab.href === current }))}
    />
  );
}
