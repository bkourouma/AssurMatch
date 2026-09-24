import { Badge, Card, Grid, PageHeader, PageStack, StateMessage } from "../lib/ui/admin-ui";
import { OperationsTabs } from "../lib/ui/operations-tabs";

export default function OperationsPage() {
  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Operations" }]}
        kicker="Operations"
        title="Operations techniques"
        description="Supervision des controles operationnels sans changement des jobs, notifications, routage ou modules IA."
      />
      <OperationsTabs current="/operations" />
      <Grid columns="two">
        <Card
          title="Notifications et routage"
          description="WhatsApp est couple a l'email, le routage reste un pre-check non transmissif et l'IA avancee reste inactive."
        >
          <Badge tone="info">Pre-check non transmissif</Badge>
        </Card>
        <Card
          title="Modules sensibles"
          description="Aucun paiement, signature, sinistre, emission de police, API assureur ou recommandation IA n'est active."
        >
          <Badge tone="disabled">Modules fermes</Badge>
        </Card>
      </Grid>
      <StateMessage>Les actions operationnelles dangereuses ne sont pas exposees par cette interface.</StateMessage>
    </PageStack>
  );
}
