import { redirect } from "next/navigation";
import { readAdminProductCategories } from "../../lib/lot4-catalog-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { CATEGORY_STATUS_LABELS, adminReadErrorMessage, formatDate } from "../../lib/catalog-messages";
import { Badge, Card, DataTable, Notice, PageHeader, PageStack, StateMessage } from "../../lib/ui/admin-ui";
import { CreateCategoryForm, EditCategoryForm } from "../catalog-forms";

const categoryStatusTone = { draft: "neutral", active: "success", retired: "disabled" } as const;

/**
 * Spec 070 PROD-001: product categories. A category is created as a draft and must be activated to
 * be chosen on a product; retiring one is refused while non-retired products use it.
 */
export default async function CatalogCategoriesPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/catalog/categories", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/catalog/categories")}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Fcatalog%2Fcategories");

  const categories = await readAdminProductCategories();
  if (categories.unauthenticated) redirect(loginRedirect("/catalog/categories", categories.error ?? "session_required"));

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue", href: "/catalog" }, { label: "Catégories" }]}
        kicker="Catalogue"
        title="Catégories de produits"
        description="Regroupent les produits (auto, santé, voyage...). Une catégorie créée est en brouillon : activez-la pour la proposer sur la fiche produit."
      />

      {categories.forbidden ? <StateMessage tone="danger">{adminReadErrorMessage("access_denied")}</StateMessage> : null}
      {categories.status === "error" ? <StateMessage tone="danger">{adminReadErrorMessage(categories.error)}</StateMessage> : null}

      {categories.status === "success" ? (
        <>
          <Card title="Catégories">
            <DataTable
              columns={[
                { key: "key", header: "Clé", render: (category) => <code>{category.key}</code> },
                { key: "name", header: "Nom (FR)", render: (category) => <strong>{category.name}</strong> },
                { key: "nameEn", header: "Nom (EN)", render: (category) => category.nameEn ?? "-" },
                { key: "status", header: "Statut", render: (category) => <Badge tone={categoryStatusTone[category.status]}>{CATEGORY_STATUS_LABELS[category.status] ?? category.status}</Badge> },
                { key: "products", header: "Produits", render: (category) => category.productCount },
                { key: "sort", header: "Ordre", render: (category) => category.sortOrder },
                { key: "updated", header: "Mis à jour", render: (category) => formatDate(category.updatedAt) }
              ]}
              items={categories.data}
              getKey={(category) => category.id}
              emptyLabel="Aucune catégorie : créez-en une puis activez-la pour la rattacher aux produits."
              aria-label="Catégories de produits"
            />
          </Card>

          <CreateCategoryForm />

          {categories.data.map((category) => (
            <Card key={category.id} title={`Modifier ${category.name}`} description={`Clé ${category.key} (non modifiable). ${category.productCount} produit(s) rattaché(s).`}>
              {category.productCount > 0 ? (
                <Notice tone="info">Le retrait de cette catégorie sera refusé tant que des produits y sont rattachés.</Notice>
              ) : null}
              <EditCategoryForm category={category} />
            </Card>
          ))}
        </>
      ) : null}
    </PageStack>
  );
}
