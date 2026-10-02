import { redirect } from "next/navigation";
import { readAdminCountries, readAdminProduct } from "../../../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../../lib/backoffice-auth";
import {
  PRODUCT_TOGGLEABLE_FLAGS,
  SENSITIVE_FLAG_EXPLANATION,
  adminReadErrorMessage,
  canApprovePublicActivation,
  flagLabel,
  formatDate
} from "../../../lib/catalog-messages";
import {
  Badge,
  Button,
  Card,
  DataTable,
  DescriptionList,
  Notice,
  PageHeader,
  PageStack,
  StateMessage,
  StatusBadge,
  catalogStatusTones
} from "../../../lib/ui/admin-ui";
import { EditProductForm, FlagToggleForm } from "../../catalog-forms";

interface ProductDetailPageProps {
  params: Promise<{ productId: string }>;
}

export default async function CatalogProductDetailPage({ params }: ProductDetailPageProps) {
  const { productId } = await params;
  const path = `/catalog/products/${productId}`;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(path, session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent(path)}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect(`/login?error=access_denied&returnTo=${encodeURIComponent(path)}`);
  const canApproveCompliance = canApprovePublicActivation(session.profile.roles);

  const [productResult, countries] = await Promise.all([readAdminProduct(productId), readAdminCountries()]);
  if (productResult.unauthenticated) redirect(loginRedirect(path, productResult.error ?? "session_required"));
  const product = productResult.data;

  if (!product) {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "Catalogue", href: "/catalog" }, { label: "Produits", href: "/catalog/products" }, { label: "Detail" }]}
          title="Produit indisponible"
          actions={<Button href="/catalog/products" variant="secondary">Retour aux produits</Button>}
        />
        <StateMessage tone="danger">{adminReadErrorMessage(productResult.error)}</StateMessage>
      </PageStack>
    );
  }

  const sensitive = product.sensitivity !== "standard";
  const readOnlyFlags = Object.keys(product.flags).filter((key) => !(PRODUCT_TOGGLEABLE_FLAGS as readonly string[]).includes(key));
  const linkedCountries = countries.data.filter((country) => product.countryIds.includes(country.id));
  const flagValue = (key: string) => product.flags[key as keyof typeof product.flags] === true;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue", href: "/catalog" }, { label: "Produits", href: "/catalog/products" }, { label: product.key }]}
        kicker="Fiche produit"
        title={`${product.name} (${product.key})`}
        description="Les flags globaux s'appliquent à tous les pays ; une suspension globale coupe le produit partout. Les flags par pays se règlent sur la fiche pays."
      />

      <Card title="Synthese">
        <DescriptionList
          columns={2}
          items={[
            { term: "Statut", value: <StatusBadge status={product.status} tones={catalogStatusTones} /> },
            { term: "Sensibilité", value: <Badge tone={sensitive ? "warning" : "neutral"}>{product.sensitivity}</Badge> },
            { term: "Documents requis", value: product.requiresDocuments ? "Oui" : "Non" },
            { term: "Revue manuelle", value: product.requiresManualReview ? "Oui" : "Non" },
            {
              term: "Pays liés",
              value: linkedCountries.length > 0
                ? linkedCountries.map((country) => <a key={country.id} href={`/catalog/countries/${encodeURIComponent(country.id)}#liaisons`}>{country.isoCode} </a>)
                : "Aucun"
            },
            { term: "Mis à jour", value: formatDate(product.updatedAt) }
          ]}
        />
      </Card>

      <EditProductForm product={product} />

      <Card title="Flags globaux du produit" description="Un formulaire par flag. Désactiver n'a aucune condition ; activer vérifie les conditions (formulaire et consentement publiés).">
        <DataTable
          columns={[
            { key: "flag", header: "Flag", render: (key: string) => <><strong>{flagLabel(key)}</strong><div><code>{key}</code></div></> },
            { key: "value", header: "État", render: (key: string) => <Badge tone={flagValue(key) ? "warning" : "disabled"}>{flagValue(key) ? "Ouvert" : "Fermé"}</Badge> },
            {
              key: "action",
              header: "Action",
              render: (key: string) => {
                if (key === "product_manual_review_required" && flagValue(key) && sensitive && !canApproveCompliance) {
                  return <span className="bo-description">Produit sensible : seule la conformité peut lever la revue manuelle.</span>;
                }
                return <FlagToggleForm target="product" productId={product.id} flagKey={key} label={flagLabel(key)} currentValue={flagValue(key)} />;
              }
            }
          ]}
          items={[...PRODUCT_TOGGLEABLE_FLAGS]}
          getKey={(key) => key}
          emptyLabel="Aucun flag modifiable."
          aria-label="Flags modifiables du produit"
        />
        {readOnlyFlags.length > 0 ? (
          <Notice tone="info" title="Flags sensibles et IA (lecture seule)">
            <ul className="bo-list">
              {readOnlyFlags.map((key) => (
                <li key={key}>
                  <code>{key}</code> : {flagValue(key) ? "ouvert" : "fermé"}. {SENSITIVE_FLAG_EXPLANATION}
                </li>
              ))}
            </ul>
          </Notice>
        ) : null}
      </Card>
    </PageStack>
  );
}
