import { redirect } from "next/navigation";
import { readAdminCountries, readAdminProducts, type AdminProductData } from "../../lib/admin-api";
import { readAdminProductCategories } from "../../lib/lot4-catalog-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { CATALOG_STATUS_LABELS, PRODUCT_STATUS_OPTIONS, adminReadErrorMessage, flagLabel, labelWithCode } from "../../lib/catalog-messages";
import { ActiveFilters, hrefWithout } from "../../lib/ui/active-filter-chips";
import {
  Badge,
  Button,
  Cluster,
  DataTable,
  Field,
  FilterBar,
  Input,
  PageHeader,
  PageStack,
  Select,
  StateMessage,
  StatusBadge,
  catalogStatusTones,
  fieldControlProps,
  paginateItems,
  readTableParams,
  sortItems
} from "../../lib/ui/admin-ui";
import type { DataTableColumn } from "../../lib/ui/admin-ui";
import { CreateProductForm } from "../catalog-forms";

const KEY_FLAGS = ["product_public_enabled", "product_quote_enabled", "product_manual_review_required"] as const;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

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
  const query = firstParam(params.q).trim();
  const statusParam = firstParam(params.status);
  const statusFilter = (PRODUCT_STATUS_OPTIONS as readonly string[]).includes(statusParam) ? statusParam : "";
  const filteredProducts = products.data.filter((product) => {
    if (statusFilter && product.status !== statusFilter) return false;
    if (query && !`${product.name} ${product.key}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });
  const activeFilterItems = [
    ...(query ? [{ label: "Recherche", value: query, removeHref: hrefWithout("/catalog/products", params, "q") }] : []),
    ...(statusFilter ? [{ label: "Statut", value: labelWithCode(CATALOG_STATUS_LABELS, statusFilter), removeHref: hrefWithout("/catalog/products", params, "status") }] : [])
  ];

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
  const rows = paginateItems(sortItems(filteredProducts, columns, table.sort), table.page, table.pageSize);

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
        <>
          <FilterBar action="/catalog/products" label="Filtres produits" submitLabel="Filtrer" resetLabel="Réinitialiser" resetHref="/catalog/products" activeCount={activeFilterItems.length} autoSubmit>
            <Field id="products-q" label="Recherche" hint="Nom ou clé du produit.">
              <Input {...fieldControlProps("products-q", { hint: "x" })} name="q" type="search" defaultValue={query} />
            </Field>
            <Field id="products-status" label="Statut">
              <Select {...fieldControlProps("products-status")} name="status" defaultValue={statusFilter}>
                <option value="">Tous</option>
                {PRODUCT_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{labelWithCode(CATALOG_STATUS_LABELS, option)}</option>)}
              </Select>
            </Field>
          </FilterBar>
          <ActiveFilters items={activeFilterItems} />
          <DataTable
            columns={columns}
            items={rows}
            getKey={(product) => product.id}
            emptyLabel={activeFilterItems.length > 0 ? "Aucun produit pour ces filtres." : "Aucun produit."}
            emptyDescription={activeFilterItems.length > 0 ? "Retirez un filtre ou réinitialisez la recherche." : "Créez un produit avec le formulaire ci-dessous, puis liez-le à un pays depuis la fiche pays."}
            emptyAction={activeFilterItems.length > 0 ? <Button href="/catalog/products" variant="secondary" size="sm">Réinitialiser les filtres</Button> : <Button href="#creer-produit" size="sm">Créer un produit</Button>}
            aria-label="Produits du catalogue"
            sort={table.sort}
            sortHref={table.sortHref}
            pagination={{
              page: table.page,
              pageSize: table.pageSize,
              total: filteredProducts.length,
              hrefFor: table.pageHref,
              label: (from, to, total) => `${from}-${to} sur ${total} produits`
            }}
          />
        </>
      ) : null}

      {products.status === "success" ? <div id="creer-produit"><CreateProductForm categories={activeCategories} /></div> : null}
    </PageStack>
  );
}
