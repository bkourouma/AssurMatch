import { Card, PageHeader, PageStack } from "../../lib/ui/admin-ui";
import { OperationsTabs } from "../../lib/ui/operations-tabs";

export default function AdminQuoteReviewPage() {
  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Operations", href: "/operations" }, { label: "Revue devis" }]}
        kicker="Operations"
        title="Revue operationnelle devis"
        description="Les demandes non routables ou doublons peuvent etre marquees sans contourner consentement, licence ou autorisation."
      />
      <OperationsTabs current="/operations/quote-review" />
      <Card>
        <p>Les demandes non routables ou doublons peuvent etre marquees sans contourner consentement, licence ou autorisation.</p>
      </Card>
    </PageStack>
  );
}
