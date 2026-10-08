import { redirect } from "next/navigation";
import { readAdminCountries, readAdminProducts, readRegulatoryRegimes } from "../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { Button, DataTable, Notice, PageHeader, PageStack, StateMessage, StatStrip } from "../lib/ui/admin-ui";

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
        title="Catalogue socle"
        description="Pays, regimes et produits, avec exposition publique desactivee par defaut et controlee par les flags existants."
      />

      <Notice tone="warning" title="Ouverture au public">
        <p>
          Un pays ou un produit est créé fermé. Son ouverture au public est refusée tant que la checklist d&apos;activation a un contrôle
          bloquant, et seule la conformité (compliance_admin, super_admin) peut la demander. Une désactivation est toujours immédiate.
        </p>
        <p>
          Chaque modification est auditée avec son motif. Les flags sensibles et IA ne sont pas modifiables depuis le catalogue : ils relèvent
          d&apos;une procédure de conformité.
        </p>
      </Notice>

      {countries.forbidden && products.forbidden ? (
        <StateMessage tone="danger">Accès au catalogue refusé pour ce rôle admin.</StateMessage>
      ) : (
        <StatStrip
          label="Synthese catalogue"
          items={[
            { label: "Pays", value: countries.data.length, href: "/catalog/countries" },
            { label: "Pays publics", value: publicCountries, tone: publicCountries > 0 ? "warning" : "neutral", helper: "Exposes aux visiteurs" },
            { label: "Produits", value: products.data.length, href: "/catalog/products" },
            { label: "Regimes", value: regimes.data.length, href: "/catalog/regimes" }
          ]}
        />
      )}

      <DataTable
        columns={[
          { key: "section", header: "Section", render: (section) => <a href={section.href}><strong>{section.title}</strong></a> },
          { key: "description", header: "Contenu", render: (section) => section.description },
          { key: "open", header: "", align: "right", render: (section) => <Button href={section.href} size="sm" variant="secondary">Ouvrir</Button> }
        ]}
        items={catalogSections}
        getKey={(section) => section.key}
        emptyLabel="Aucune section catalogue disponible."
        aria-label="Sections du catalogue socle"
      />
    </PageStack>
  );
}
