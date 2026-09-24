import { Card, PageHeader, PageStack } from "../lib/ui/admin-ui";
import { OperationsTabs } from "../lib/ui/operations-tabs";

export default function AdminQuoteRequestsPage() {
  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Operations", href: "/operations" }, { label: "Demandes de devis" }]}
        kicker="Operations"
        title="Demandes de devis"
        description="Suivi des demandes, consentements, doublons, routage et notifications avec acces RBAC."
      />
      <OperationsTabs current="/quote-requests" />
      <Card>
        <p>Suivi des demandes, consentements, doublons, routage et notifications avec acces RBAC.</p>
      </Card>
    </PageStack>
  );
}
