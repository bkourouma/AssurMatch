import { Badge, Card, DescriptionList, PageHeader, PageStack, StateMessage } from "../lib/ui/admin-ui";
import { OperationsTabs } from "../lib/ui/operations-tabs";

export default function OperationsPage() {
  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Operations" }]}
        title="Operations techniques"
        description="Etat des controles operationnels. Les jobs, notifications, routage et modules IA se pilotent depuis leurs consoles."
      />
      <OperationsTabs current="/operations" />
      <StateMessage>Les actions operationnelles dangereuses ne sont pas exposees par cette interface.</StateMessage>
      <Card title="Controles en place">
        <DescriptionList
          items={[
            { term: "Notifications", value: "WhatsApp est couple a l'email." },
            { term: "Routage", value: <Badge tone="info">Pre-check non transmissif</Badge> },
            { term: "Regle", value: "Le routage reste un pre-check non transmissif et l'IA avancee reste inactive." },
            { term: "Modules sensibles", value: <Badge tone="disabled">Modules fermes</Badge> },
            { term: "Detail", value: "Aucun paiement, signature, sinistre, emission de police, API assureur ou recommandation IA n'est active." }
          ]}
        />
      </Card>
    </PageStack>
  );
}
