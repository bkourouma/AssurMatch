import { redirect } from "next/navigation";
import { readAdminCountries, readAdminProducts, readRegulatoryRegimes } from "../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { Badge, Button, Card, DataTable, Grid, KpiCard, Notice, PageHeader, PageStack, StateMessage } from "../lib/ui/admin-ui";

interface CatalogSection {
  key: string;
  title: string;
  href: string;
  description: string;
}

const catalogSections: CatalogSection[] = [
  { key: "countries", title: "Pays", href: "/catalog/countries", description: "Fiche, statut, flags pays, liaisons produits et résumé de la checklist." },
  { key: "products", title: "Produits", href: "/catalog/products", description: "Fiche produit et flags globaux (le flag effectif combine produit et liaison pays)." },
  { key: "regimes", title: "Regimes reglementaires", href: "/catalog/regimes", description: "Régimes référencés par les pays ; un régime référencé ne peut pas être retiré." },
  { key: "consent", title: "Consentements", href: "/consent-texts", description: "Textes versionnés, empreinte calculée par le serveur, publication réservée à la conformité." },
  { key: "forms", title: "Formulaires devis", href: "/quote-form-definitions", description: "Formulaires par pays, produit et langue, liés à un consentement publié." }
];

export default async function CatalogFoundationPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/catalog", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/catalog")}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Fcatalog");

  const [countries, products, regimes] = await Promise.all([readAdminCountries(), readAdminProducts(), readRegulatoryRegimes()]);
  const publicCountries = countries.data.filter((country) => country.status === "public").length;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Configuration" }, { label: "Catalogue" }]}
        kicker="Configuration"
        title="Catalogue socle"
        description="Pilotage interne des pays, regimes et produits avec exposition publique desactivee par defaut et controlee par les flags existants."
      />

      <Notice tone="warning" title="Ouverture au public">
        Un pays ou un produit est créé fermé. Son ouverture au public est refusée tant que la checklist d&apos;activation a un contrôle
        bloquant, et seule la conformité (compliance_admin, super_admin) peut la demander. Une désactivation est toujours immédiate.
      </Notice>

      {countries.forbidden && products.forbidden ? (
        <StateMessage tone="danger">Accès au catalogue refusé pour ce rôle admin.</StateMessage>
      ) : (
        <Grid columns="kpi" as="section" aria-label="Synthese catalogue">
          <KpiCard label="Pays" value={countries.data.length} tone="neutral" />
          <KpiCard label="Pays publics" value={publicCountries} tone={publicCountries > 0 ? "warning" : "neutral"} />
          <KpiCard label="Produits" value={products.data.length} tone="neutral" />
          <KpiCard label="Regimes" value={regimes.data.length} tone="neutral" />
        </Grid>
      )}

      <Card>
        <DataTable
          columns={[
            { key: "section", header: "Section", render: (section) => <a href={section.href}><strong>{section.title}</strong></a> },
            { key: "description", header: "Contenu", render: (section) => section.description },
            { key: "status", header: "Statut", render: () => <Badge tone="disabled">Exposition publique controlee</Badge> },
            { key: "open", header: "", render: (section) => <Button href={section.href} size="sm" variant="secondary">Ouvrir</Button> }
          ]}
          items={catalogSections}
          getKey={(section) => section.key}
          emptyLabel="Aucune section catalogue disponible."
          aria-label="Sections du catalogue socle"
        />
      </Card>
      <StateMessage>
        Chaque modification est auditée avec son motif. Les flags sensibles et IA ne sont pas modifiables depuis le catalogue : ils relèvent
        d&apos;une procédure de conformité. La checklist technique d&apos;activation reste la référence avant toute ouverture.
      </StateMessage>
    </PageStack>
  );
}
