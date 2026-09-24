import { Card, PageHeader, PageStack } from "../lib/ui/admin-ui";
import { OperationsTabs } from "../lib/ui/operations-tabs";

export default function AdminProspectsPage() {
  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Operations", href: "/operations" }, { label: "Prospects" }]}
        kicker="Operations"
        title="Prospects"
        description="Recherche paginee avec perimetre PII limite par role, pays et produit."
      />
      <OperationsTabs current="/prospects" />
      <Card>
        <p>Recherche paginee avec perimetre PII limite par role, pays et produit.</p>
      </Card>
    </PageStack>
  );
}
