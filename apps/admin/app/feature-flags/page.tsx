import { Badge, Card, DataTable, PageHeader, PageStack, StateMessage } from "../lib/ui/admin-ui";
import { sensitiveFeatureFlagKeys } from "../lib/ui/admin-view-models";

export default function FeatureFlagsPage() {
  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Plateforme" }, { label: "Feature flags" }]}
        kicker="Activation progressive"
        title="Feature flags"
        description="Vue de pilotage des flags globaux, pays, produits, partenaires et modules. Les modules sensibles restent fail-closed et auditables."
      />
      <Card
        title="Desactivation rapide"
        description="Les flags globaux, pays, produits, partenaires et modules restent auditables et fail-closed."
      >
        <Badge tone="disabled">Aucune activation par cette interface</Badge>
      </Card>
      <Card title="Modules sensibles (lecture seule)">
        <DataTable
          columns={[
            { key: "flag", header: "Flag", render: (flag) => <code>{flag}</code> },
            { key: "expected", header: "Etat attendu", render: () => <Badge tone="disabled">Desactive</Badge> },
            { key: "control", header: "Controle", render: () => "Aucune activation par cette interface" }
          ]}
          items={sensitiveFeatureFlagKeys}
          getKey={(flag) => flag}
          emptyLabel="Aucun flag sensible reference."
          aria-label="Modules sensibles"
        />
      </Card>
      <StateMessage tone="warning">Cette feature UX ne cree aucun bouton d'activation pour les modules reglementes.</StateMessage>
    </PageStack>
  );
}
