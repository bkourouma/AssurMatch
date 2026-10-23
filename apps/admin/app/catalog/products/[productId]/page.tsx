import { redirect } from "next/navigation";
import { readAdminProductCategories, readAdminProductVersions } from "../../../lib/lot4-catalog-api";
import { readAdminCountries, readAdminProduct } from "../../../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../../lib/backoffice-auth";
import {
  PRODUCT_TOGGLEABLE_FLAGS,
  SENSITIVE_FLAG_EXPLANATION,
  adminReadErrorMessage,
  documentKindLabel,
  formatVersionValue,
  versionFieldLabel,
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
  Split,
  StateMessage,
  StatusBadge,
  catalogStatusTones
} from "../../../lib/ui/admin-ui";
import { EditProductForm, FlagToggleForm, ProductStatusForm } from "../../catalog-forms";

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

  const [productResult, countries, categories, versions] = await Promise.all([
    readAdminProduct(productId),
    readAdminCountries(),
    readAdminProductCategories(),
    readAdminProductVersions(productId)
  ]);
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
  const activeCategories = categories.data.filter((category) => category.status === "active" || category.id === product.categoryId).map((category) => ({ value: category.id, label: category.name }));
  const currentCategory = categories.data.find((category) => category.id === product.categoryId);
  const legalNotice = product.legalNotice ?? {};
  const requiredKinds = product.requiredDocumentKinds ?? [];
  const flagValue = (key: string) => product.flags[key as keyof typeof product.flags] === true;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue", href: "/catalog" }, { label: "Produits", href: "/catalog/products" }, { label: product.key }]}
        title={`${product.name} (${product.key})`}
        description="Les flags globaux s'appliquent à tous les pays ; une suspension globale coupe le produit partout. Les flags par pays se règlent sur la fiche pays."
        actions={<StatusBadge status={product.status} tones={catalogStatusTones} />}
      />

      <Split>
        <Card title="Synthese">
          <DescriptionList
            columns={2}
            items={[
              { term: "Statut", value: <StatusBadge status={product.status} tones={catalogStatusTones} /> },
              { term: "Sensibilité", value: <Badge tone={sensitive ? "warning" : "neutral"}>{product.sensitivity}</Badge> },
              { term: "Documents requis", value: product.requiresDocuments ? "Oui" : "Non" },
              { term: "Revue manuelle", value: product.requiresManualReview ? "Oui" : "Non" },
              { term: "Catégorie", value: currentCategory ? currentCategory.name : "Aucune" },
              { term: "Version courante", value: `v${product.version ?? 1}` },
              { term: "Types de documents demandés", value: requiredKinds.length > 0 ? requiredKinds.map(documentKindLabel).join(", ") : "Aucun" },
              { term: "Texte légal (FR)", value: legalNotice.fr?.legalText || "Non renseigné" },
              { term: "Avertissement (FR)", value: legalNotice.fr?.disclaimer || "Non renseigné" },
              { term: "Texte légal (EN)", value: legalNotice.en?.legalText || "Non renseigné" },
              { term: "Avertissement (EN)", value: legalNotice.en?.disclaimer || "Non renseigné" },
              {
                term: "Pays liés",
                value: linkedCountries.length > 0
                  ? linkedCountries.map((country) => <a key={country.id} className="bo-ref" href={`/catalog/countries/${encodeURIComponent(country.id)}#liaisons`}>{country.isoCode} </a>)
                  : "Aucun"
              },
              { term: "Mis à jour", value: formatDate(product.updatedAt) }
            ]}
          />
        </Card>
        <ProductStatusForm productId={product.id} currentStatus={product.status} canApprovePublic={canApproveCompliance} />
      </Split>

      <EditProductForm product={product} categories={activeCategories} />

      <Card title="Flags globaux du produit" description="Un formulaire par flag. Désactiver n'a aucune condition ; activer vérifie les conditions (formulaire et consentement publiés).">
        <DataTable
          columns={[
            { key: "flag", header: "Flag", render: (key: string) => <><strong>{flagLabel(key)}</strong><div className="bo-ref">{key}</div></> },
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
                  <span className="bo-ref">{key}</span> : {flagValue(key) ? "ouvert" : "fermé"}. {SENSITIVE_FLAG_EXPLANATION}
                </li>
              ))}
            </ul>
          </Notice>
        ) : null}
      </Card>

      <Card title="Historique des conditions" description="Chaque enregistrement crée une version avec son auteur, son motif et le détail champ par champ (avant → après).">
        {versions.status === "success" && versions.data.length === 0 ? (
          <StateMessage>Aucune version enregistrée pour ce produit.</StateMessage>
        ) : null}
        {versions.status !== "success" ? <StateMessage tone="danger">{adminReadErrorMessage(versions.error)}</StateMessage> : null}
        <ol className="bo-list" data-product-versions="true" aria-label="Versions du produit">
          {versions.data.map((version) => (
            <li key={version.versionNumber} data-product-version={version.versionNumber}>
              <strong>{`Version ${version.versionNumber}`}</strong>
              {` — ${formatDate(version.createdAt)} — ${version.authorLabel ?? (version.authorId ? version.authorId.slice(0, 8) : "système")}`}
              <div>{version.versionNumber === 1 ? "Création" : `Motif : ${version.reason}`}</div>
              {version.versionNumber !== 1 && version.changes.length > 0 ? (
                <ul className="bo-list">
                  {version.changes.map((change) => (
                    <li key={change.field}>
                      <strong>{versionFieldLabel(change.field)}</strong>
                      {` : ${formatVersionValue(change.field, change.before)} → ${formatVersionValue(change.field, change.after)}`}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>
    </PageStack>
  );
}
