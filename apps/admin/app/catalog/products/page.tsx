import { redirect } from "next/navigation";
import { readAdminCountries, readAdminProducts, type AdminProductData } from "../../lib/admin-api";
import { readAdminProductCategories } from "../../lib/lot4-catalog-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { adminReadErrorMessage, flagLabel } from "../../lib/catalog-messages";
import {
  Badge,
  Button,
  Cluster,
  DataTable,
  PageHeader,
  PageStack,
  StateMessage,
  StatusBadge,
  catalogStatusTones,
  paginateItems,
  readTableParams,
  sortItems
} from "../../lib/ui/admin-ui";
import type { DataTableColumn } from "../../lib/ui/admin-ui";
import { CreateProductForm } from "../catalog-forms";

const KEY_FLAGS = ["product_public_enabled", "product_quote_enabled", "product_manual_review_required"] as const;

export default async function CatalogProductsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/catalog/products", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/catalog/products")}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Fcatalog%2Fproducts");

  const params = searchParams ? await searchParams : {};
  const [products, countries, categories] = await Promise.all([readAdminProducts(), readAdminCountries(), readAdminProductCategories()]);
  if (products.unauthenticated) redirect(loginRedirect("/catalog/products", products.error ?? "session_required"));
  const activeCategories = categories.data.filter((category) => category.status === "active").map((category) => ({ value: category.id, label: category.name }));
  const categoryNames = new Map(categories.data.map((category) => [category.id, category.name]));
  const countryCodes = new Map(countries.data.map((country) => [country.id, country.isoCode]));

  const columns: Array<DataTableColumn<AdminProductData>> = [
    {
      key: "key",
      header: "Clé",
      render: (product) => <a className="bo-ref" href={`/catalog/products/${encodeURIComponent(product.id)}`}>{product.key}</a>,
      sortable: true,
      sortValue: (product) => product.key
    },
    { key: "name", header: "Nom", render: (product) => product.name, sortable: true, sortValue: (product) => product.name },
    {
      key: "status",
      header: "Statut",
      render: (product) => <StatusBadge status={product.status} tones={catalogStatusTones} />,
      sortable: true,
      sortValue: (product) => product.status
    },
    {
      key: "sensitivity",
      header: "Sensibilité",
      render: (product) => <Badge tone={product.sensitivity === "standard" ? "neutral" : "warning"}>{product.sensitivity}</Badge>
    },
    {
      key: "category",
      header: "Catégorie",
      render: (product) => (product.categoryId ? categoryNames.get(product.categoryId) ?? "-" : "-")
    },
    {
      key: "countries",
      header: "Pays liés",
      render: (product) => product.countryIds.map((id) => countryCodes.get(id) ?? id.slice(0, 8)).join(", ") || "-"
    },
    {
      key: "flags",
      header: "Flags globaux clés",
      render: (product) => (
        <Cluster>
          {KEY_FLAGS.map((key) => (
            <Badge key={key} tone={product.flags[key] ? "warning" : "disabled"}>{`${flagLabel(key)} : ${product.flags[key] ? "oui" : "non"}`}</Badge>
          ))}
        </Cluster>
      )
    }
  ];

  const table = readTableParams(params, { pathname: "/catalog/products", defaultSort: { key: "key", direction: "asc" }, pageSize: 25 });
  const rows = paginateItems(sortItems(products.data, columns, table.sort), table.page, table.pageSize);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue", href: "/catalog" }, { label: "Produits" }]}
        title="Produits"
        description="Produits du catalogue. Le flag lu par le parcours public combine le flag global du produit et celui de la liaison pays (fiche pays)."
        actions={products.status === "success" ? <Button href="#creer-produit">Créer un produit</Button> : null}
      />

      {products.forbidden ? <StateMessage tone="danger">{adminReadErrorMessage("access_denied")}</StateMessage> : null}
      {products.status === "error" ? <StateMessage tone="danger">{adminReadErrorMessage(products.error)}</StateMessage> : null}

      {products.status === "success" ? (
        <DataTable
          columns={columns}
          items={rows}
          getKey={(product) => product.id}
          emptyLabel="Aucun produit."
          emptyDescription="Créez un produit avec le formulaire ci-dessous, puis liez-le à un pays depuis la fiche pays."
          aria-label="Produits du catalogue"
          sort={table.sort}
          sortHref={table.sortHref}
          pagination={{
            page: table.page,
            pageSize: table.pageSize,
            total: products.data.length,
            hrefFor: table.pageHref,
            label: (from, to, total) => `${from}-${to} sur ${total} produits`
          }}
        />
      ) : null}

      {products.status === "success" ? <div id="creer-produit"><CreateProductForm categories={activeCategories} /></div> : null}
    </PageStack>
  );
}
