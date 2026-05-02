import { Badge, Card, DataTable, PageHeader, StateMessage } from "../lib/ui/admin-ui";
import { sensitiveFeatureFlagKeys } from "../lib/ui/admin-view-models";

export default function FeatureFlagsPage() {
  return (
    <div className="page-stack">
      <PageHeader
        kicker="Activation progressive"
        title="Feature flags"
        description="Vue de pilotage des flags globaux, pays, produits, partenaires et modules. Les modules sensibles restent fail-closed et auditables."
      />
      <Card>
        <h2 className="section-title">Desactivation rapide</h2>
        <p className="page-description">Les flags globaux, pays, produits, partenaires et modules restent auditables et fail-closed.</p>
      </Card>
      <Card>
        <h2 className="section-title">Modules sensibles (lecture seule)</h2>
        <DataTable
          columns={[
            { header: "Flag", render: (flag) => <code>{flag}</code> },
            { header: "Etat attendu", render: () => <Badge tone="disabled">Desactive</Badge> },
            { header: "Controle", render: () => "Aucune activation par cette interface" }
          ]}
          items={sensitiveFeatureFlagKeys}
          getKey={(flag) => flag}
          emptyLabel="Aucun flag sensible reference."
        />
      </Card>
      <StateMessage tone="warning">Cette feature UX ne cree aucun bouton d'activation pour les modules reglementes.</StateMessage>
    </div>
  );
}
