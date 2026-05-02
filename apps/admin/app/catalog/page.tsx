import { Badge, Card, DataTable, PageHeader, StateMessage } from "../lib/ui/admin-ui";

const catalogSections = ["Pays", "Regimes reglementaires", "Produits"];

export default function CatalogFoundationPage() {
  return (
    <div className="page-stack">
      <PageHeader
        kicker="Configuration"
        title="Catalogue socle"
        description="Pilotage interne des pays, regimes et produits avec exposition publique desactivee par defaut et controlee par les flags existants."
      />
      <Card>
        <DataTable
          columns={[
            { header: "Section", render: (section) => <strong>{section}</strong> },
            { header: "Statut", render: () => <Badge tone="disabled">Exposition publique controlee</Badge> },
            { header: "Garde-fou", render: () => "Actions sensibles auditees cote API" }
          ]}
          items={catalogSections}
          getKey={(section) => section}
          emptyLabel="Aucune section catalogue disponible."
        />
      </Card>
      <StateMessage>Les changements de catalogue ne sont pas effectues par cette page de polish UX.</StateMessage>
    </div>
  );
}
