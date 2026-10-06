import { redirect } from "next/navigation";
import {
  readAdminConsentTexts,
  readAdminCountries,
  readAdminProducts,
  readConsentTextTemplates,
  type AdminConsentTextData,
  type AdminConsentTextFilters
} from "../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import {
  CONSENT_PURPOSE_OPTIONS,
  CONSENT_STATUS_OPTIONS,
  LANGUAGE_OPTIONS,
  adminReadErrorMessage,
  formatDate
} from "../lib/catalog-messages";
import {
  Badge,
  Card,
  DataTable,
  Field,
  FilterBar,
  PageHeader,
  PageStack,
  Select,
  StateMessage,
  StatusBadge,
  consentTextStatusTones,
  fieldControlProps,
  paginateItems,
  readTableParams,
  sortItems
} from "../lib/ui/admin-ui";
import type { DataTableColumn } from "../lib/ui/admin-ui";
import { CreateConsentTextForm } from "./consent-forms";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ConsentTextsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/consent-texts", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/consent-texts")}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Fconsent-texts");

  const params = searchParams ? await searchParams : {};
  const filters: AdminConsentTextFilters = {
    countryId: firstParam(params.countryId),
    productId: firstParam(params.productId),
    purpose: firstParam(params.purpose),
    language: firstParam(params.language),
    status: firstParam(params.status)
  };
  const activeCount = Object.values(filters).filter(Boolean).length;

  const [texts, templates, countries, products] = await Promise.all([
    readAdminConsentTexts(filters),
    readConsentTextTemplates(),
    readAdminCountries(),
    readAdminProducts()
  ]);
  if (texts.unauthenticated) redirect(loginRedirect("/consent-texts", texts.error ?? "session_required"));
  const countryCodes = new Map(countries.data.map((country) => [country.id, country.isoCode]));
  const productKeys = new Map(products.data.map((product) => [product.id, product.key]));
  const countryChoices = countries.data.map((country) => ({ value: country.id, label: `${country.isoCode} - ${country.name}` }));
  const productChoices = products.data.map((product) => ({ value: product.id, label: `${product.key} - ${product.name}` }));

  const columns: Array<DataTableColumn<AdminConsentTextData>> = [
    {
      key: "version",
      header: "Version",
      render: (text) => <a href={`/consent-texts/${encodeURIComponent(text.id)}`}><strong>{text.version}</strong></a>,
      sortable: true,
      sortValue: (text) => text.version
    },
    { key: "purpose", header: "Finalité", render: (text) => text.purpose, sortable: true, sortValue: (text) => text.purpose },
    { key: "country", header: "Pays", render: (text) => countryCodes.get(text.countryId) ?? text.countryId.slice(0, 8) },
    { key: "product", header: "Produit", render: (text) => (text.productId ? productKeys.get(text.productId) ?? text.productId.slice(0, 8) : "Tous") },
    { key: "language", header: "Langue", render: (text) => text.language, sortable: true, sortValue: (text) => text.language },
    {
      key: "status",
      header: "Statut",
      render: (text) => (
        <>
          <StatusBadge status={text.status} tones={consentTextStatusTones} />
          {text.supersededBy ? <Badge tone="warning">Remplacé</Badge> : null}
          {!text.content ? <Badge tone="danger">Sans contenu</Badge> : null}
        </>
      ),
      sortable: true,
      sortValue: (text) => text.status
    },
    { key: "hash", header: "Empreinte", render: (text) => <code>{text.contentHash.slice(0, 12)}</code> },
    { key: "publishedAt", header: "Publié le", render: (text) => formatDate(text.publishedAt), sortable: true, sortValue: (text) => text.publishedAt ?? null }
  ];

  const table = readTableParams(params, { pathname: "/consent-texts", defaultSort: { key: "publishedAt", direction: "desc" }, pageSize: 25 });
  const rows = paginateItems(sortItems(texts.data, columns, table.sort), table.page, table.pageSize);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue", href: "/catalog" }, { label: "Consentements" }]}
        kicker="Conformité"
        title="Textes de consentement"
        description="Textes versionnés par finalité, pays, produit et langue. L'empreinte est calculée par le serveur à partir du contenu ; un texte publié est immuable."
      />

      {texts.forbidden ? (
        <StateMessage tone="danger">Accès aux textes de consentement réservé à la conformité (compliance_admin, super_admin).</StateMessage>
      ) : null}
      {texts.status === "error" ? <StateMessage tone="danger">{adminReadErrorMessage(texts.error)}</StateMessage> : null}

      {texts.status === "success" ? (
        <Card title="Versions">
          <FilterBar
            action="/consent-texts"
            label="Filtres textes de consentement"
            submitLabel="Filtrer"
            resetLabel="Reinitialiser"
            resetHref="/consent-texts"
            activeCount={activeCount}
            autoSubmit
          >
            <Field id="consent-country" label="Pays">
              <Select {...fieldControlProps("consent-country")} name="countryId" defaultValue={filters.countryId}>
                <option value="">Tous</option>
                {countryChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
              </Select>
            </Field>
            <Field id="consent-product" label="Produit">
              <Select {...fieldControlProps("consent-product")} name="productId" defaultValue={filters.productId}>
                <option value="">Tous</option>
                {productChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
              </Select>
            </Field>
            <Field id="consent-purpose" label="Finalité">
              <Select {...fieldControlProps("consent-purpose")} name="purpose" defaultValue={filters.purpose}>
                <option value="">Toutes</option>
                {CONSENT_PURPOSE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            </Field>
            <Field id="consent-language" label="Langue">
              <Select {...fieldControlProps("consent-language")} name="language" defaultValue={filters.language}>
                <option value="">Toutes</option>
                {LANGUAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            </Field>
            <Field id="consent-status" label="Statut">
              <Select {...fieldControlProps("consent-status")} name="status" defaultValue={filters.status}>
                <option value="">Tous</option>
                {CONSENT_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            </Field>
          </FilterBar>
          <DataTable
            columns={columns}
            items={rows}
            getKey={(text) => text.id}
            emptyLabel="Aucun texte pour ces filtres : un produit sans consentement de transmission publié ne peut pas être ouvert au public."
            aria-label="Textes de consentement"
            sort={table.sort}
            sortHref={table.sortHref}
            pagination={{
              page: table.page,
              pageSize: table.pageSize,
              total: texts.data.length,
              hrefFor: table.pageHref,
              label: (from, to, total) => `${from}-${to} sur ${total} textes`
            }}
          />
        </Card>
      ) : null}

      {texts.status === "success" ? (
        <CreateConsentTextForm
          templates={templates.data.map((template) => ({
            templateKey: template.templateKey,
            purpose: template.purpose,
            language: template.language,
            bodyTemplate: template.bodyTemplate,
            notes: template.notes
          }))}
          countries={countryChoices}
          products={productChoices}
        />
      ) : null}
    </PageStack>
  );
}
