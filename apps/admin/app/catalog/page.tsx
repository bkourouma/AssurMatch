import { Badge, Card, DataTable, PageHeader, PageStack, StateMessage } from "../lib/ui/admin-ui";

const catalogSections = ["Pays", "Regimes reglementaires", "Produits"];

export default function CatalogFoundationPage() {
  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue" }, { label: "Catalogue" }]}
        kicker="Configuration"
        title="Catalogue socle"
        description="Pilotage interne des pays, regimes et produits avec exposition publique desactivee par defaut et controlee par les flags existants."
      />
      <Card>
        <DataTable
          columns={[
            { key: "section", header: "Section", render: (section) => <strong>{section}</strong> },
            { key: "status", header: "Statut", render: () => <Badge tone="disabled">Exposition publique controlee</Badge> },
            { key: "guardrail", header: "Garde-fou", render: () => "Actions sensibles auditees cote API" }
          ]}
          items={catalogSections}
          getKey={(section) => section}
          emptyLabel="Aucune section catalogue disponible."
          aria-label="Sections du catalogue socle"
        />
      </Card>
      <StateMessage>Les changements de catalogue ne sont pas effectues par cette page de polish UX.</StateMessage>
    </PageStack>
  );
}
