import { Card, PageHeader, PageStack, Stack } from "../lib/ui/admin-ui";

export default function AdminOffersPage() {
  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue" }, { label: "Catalogue", href: "/catalog" }, { label: "Offres indicatives" }]}
        kicker="Catalogue"
        title="Offres indicatives"
        description="Gestion des offres, validation, suspension, sponsorisation visible et periode de validite."
      />
      <Card>
        <Stack>
          <p>Gestion des offres, validation, suspension, sponsorisation visible et periode de validite.</p>
          <p>Aucune offre expiree ou non validee ne doit etre publique.</p>
        </Stack>
      </Card>
    </PageStack>
  );
}
