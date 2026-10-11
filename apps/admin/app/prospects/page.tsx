import { Button, EmptyState, PageHeader, PageStack } from "../lib/ui/admin-ui";
import { OperationsTabs } from "../lib/ui/operations-tabs";

export default function AdminProspectsPage() {
  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Operations", href: "/operations" }, { label: "Prospects" }]}
        title="Prospects"
        description="Recherche paginee avec perimetre PII limite par role, pays et produit."
      />
      <OperationsTabs current="/prospects" />
      <EmptyState
        icon="search"
        title="Recherche de prospects non disponible ici"
        description="Pour retrouver un prospect, ouvrez sa demande de devis : les coordonnees y sont affichees selon votre role et votre perimetre pays."
        action={<Button href="/quote-requests" variant="secondary">Ouvrir les demandes de devis</Button>}
      />
    </PageStack>
  );
}
