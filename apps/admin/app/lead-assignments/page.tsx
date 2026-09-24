import { Card, PageHeader, PageStack } from "../lib/ui/admin-ui";
import { OperationsTabs } from "../lib/ui/operations-tabs";

export default function AdminLeadAssignmentsPage() {
  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Operations", href: "/operations" }, { label: "Assignations" }]}
        kicker="Operations"
        title="Routage des leads"
        description="Resultats de routage, courtier assigne, exclusions et raisons auditees."
      />
      <OperationsTabs current="/lead-assignments" />
      <Card>
        <p>Resultats de routage, courtier assigne, exclusions et raisons auditees.</p>
      </Card>
    </PageStack>
  );
}
