import { Badge, Button, Card, Cluster, DescriptionList, PageHeader, PageStack, StateMessage } from "../lib/ui/admin-ui";
import { OperationsTabs, operationsTabs } from "../lib/ui/operations-tabs";

export default function OperationsPage() {
  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Opérations" }]}
        title="Opérations techniques"
        description="État des contrôles opérationnels. Les jobs, notifications, routage et modules IA se pilotent depuis leurs consoles."
      />
      <OperationsTabs current="/operations" />
      <StateMessage>Les actions opérationnelles dangereuses ne sont pas exposées par cette interface.</StateMessage>
      <Card title="Consoles d'exploitation" description="Accès direct aux écrans de traitement des demandes.">
        <Cluster>
          {operationsTabs.filter((tab) => tab.href !== "/operations").map((tab) => (
            <Button key={tab.href} href={tab.href} variant="secondary" size="sm">{tab.label}</Button>
          ))}
        </Cluster>
      </Card>
      <Card title="Contrôles en place">
        <DescriptionList
          items={[
            { term: "Notifications", value: "WhatsApp est couplé à l'email." },
            { term: "Routage", value: <Badge tone="info">Pré-check non transmissif</Badge> },
            { term: "Règle", value: "Le routage reste un pré-check non transmissif et l'IA avancée reste inactive." },
            { term: "Modules sensibles", value: <Badge tone="disabled">Modules fermés</Badge> },
            { term: "Détail", value: "Aucun paiement, signature, sinistre, émission de police, API assureur ou recommandation IA n'est active." }
          ]}
        />
      </Card>
    </PageStack>
  );
}
