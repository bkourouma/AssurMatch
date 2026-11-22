import { redirect } from "next/navigation";
import { readAdminCountries, readRegulatoryRegimes, type AdminCountryData } from "../../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { CATALOG_STATUS_LABELS, COUNTRY_STATUS_OPTIONS, adminReadErrorMessage, flagLabel, labelWithCode } from "../../lib/catalog-messages";
import { ActiveFilters, hrefWithout } from "../../lib/ui/active-filters";
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
import { CreateCountryForm } from "../catalog-forms";

const KEY_FLAGS = ["country_public_enabled", "country_quote_enabled", "country_comparison_enabled"] as const;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function CatalogCountriesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/catalog/countries", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/catalog/countries")}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Fcatalog%2Fcountries");

  const params = searchParams ? await searchParams : {};
  const [countries, regimes] = await Promise.all([readAdminCountries(), readRegulatoryRegimes()]);
  if (countries.unauthenticated) redirect(loginRedirect("/catalog/countries", countries.error ?? "session_required"));
  const regimeNames = new Map(regimes.data.map((regime) => [regime.id, regime.name]));
  const query = firstParam(params.q).trim();
  const statusParam = firstParam(params.status);
  const statusFilter = (COUNTRY_STATUS_OPTIONS as readonly string[]).includes(statusParam) ? statusParam : "";
  const filteredCountries = countries.data.filter((country) => {
    if (statusFilter && country.status !== statusFilter) return false;
    if (query && !`${country.name} ${country.isoCode}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });
  const activeFilterItems = [
    ...(query ? [{ label: "Recherche", value: query, removeHref: hrefWithout("/catalog/countries", params, "q") }] : []),
    ...(statusFilter ? [{ label: "Statut", value: labelWithCode(CATALOG_STATUS_LABELS, statusFilter), removeHref: hrefWithout("/catalog/countries", params, "status") }] : [])
  ];

  const columns: Array<DataTableColumn<AdminCountryData>> = [
    {
      key: "iso",
      header: "ISO",
      render: (country) => <a className="bo-ref" href={`/catalog/countries/${encodeURIComponent(country.id)}`}>{country.isoCode}</a>,
      sortable: true,
      sortValue: (country) => country.isoCode
    },
    { key: "name", header: "Nom", render: (country) => country.name, sortable: true, sortValue: (country) => country.name },
    {
      key: "status",
      header: "Statut",
      render: (country) => <StatusBadge status={country.status} tones={catalogStatusTones} />,
      sortable: true,
      sortValue: (country) => country.status
    },
    {
      key: "regime",
      header: "Régime",
      render: (country) => (country.regulatoryRegimeId ? regimeNames.get(country.regulatoryRegimeId) ?? country.regulatoryRegimeId.slice(0, 8) : <Badge tone="warning">Non renseigné</Badge>)
    },
    { key: "languages", header: "Langues", render: (country) => country.languages.join(", ") },
    {
      key: "phone",
      header: "Téléphone",
      render: (country) => (country.phoneDialCode ? `${country.phoneDialCode} (${country.phoneNationalLengths.join("/") || "?"} chiffres)` : "Générique")
    },
    {
      key: "flags",
      header: "Flags clés",
      render: (country) => (
        <Cluster>
          {KEY_FLAGS.map((key) => (
            <Badge key={key} tone={country.flags[key] ? "warning" : "disabled"}>{`${flagLabel(key)} : ${country.flags[key] ? "ouvert" : "fermé"}`}</Badge>
          ))}
        </Cluster>
      )
    }
  ];

  const table = readTableParams(params, { pathname: "/catalog/countries", defaultSort: { key: "iso", direction: "asc" }, pageSize: 25 });
  const rows = paginateItems(sortItems(filteredCountries, columns, table.sort), table.page, table.pageSize);
  const regimeChoices = regimes.data.filter((regime) => regime.status !== "retired").map((regime) => ({ value: regime.id, label: `${regime.name} (${regime.key})` }));

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue", href: "/catalog" }, { label: "Pays" }]}
        title="Pays"
        description="Pays administrés dans votre périmètre. Un pays créé reste en brouillon, fermé au public, jusqu'à une ouverture validée par la conformité."
        actions={countries.status === "success" ? <Button href="#creer-pays">Créer un pays</Button> : null}
      />

      {countries.forbidden ? <StateMessage tone="danger">{adminReadErrorMessage("access_denied")}</StateMessage> : null}
      {countries.status === "error" ? <StateMessage tone="danger">{adminReadErrorMessage(countries.error)}</StateMessage> : null}

      {countries.status === "success" ? (
        <>
          <FilterBar action="/catalog/countries" label="Filtres pays" submitLabel="Filtrer" resetLabel="Réinitialiser" resetHref="/catalog/countries" activeCount={activeFilterItems.length} autoSubmit>
            <Field id="countries-q" label="Recherche" hint="Nom ou code ISO.">
              <Input {...fieldControlProps("countries-q", { hint: "x" })} name="q" type="search" defaultValue={query} />
            </Field>
            <Field id="countries-status" label="Statut">
              <Select {...fieldControlProps("countries-status")} name="status" defaultValue={statusFilter}>
                <option value="">Tous</option>
                {COUNTRY_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{labelWithCode(CATALOG_STATUS_LABELS, option)}</option>)}
              </Select>
            </Field>
          </FilterBar>
          <ActiveFilters items={activeFilterItems} />
          <DataTable
            columns={columns}
            items={rows}
            getKey={(country) => country.id}
            emptyLabel={activeFilterItems.length > 0 ? "Aucun pays pour ces filtres." : "Aucun pays dans votre périmètre."}
            emptyDescription={activeFilterItems.length > 0 ? "Retirez un filtre ou réinitialisez la recherche." : "Créez un pays avec le formulaire ci-dessous ; il restera fermé au public."}
            emptyAction={activeFilterItems.length > 0 ? <Button href="/catalog/countries" variant="secondary" size="sm">Réinitialiser les filtres</Button> : <Button href="#creer-pays" size="sm">Créer un pays</Button>}
            aria-label="Pays du catalogue"
            sort={table.sort}
            sortHref={table.sortHref}
            pagination={{
              page: table.page,
              pageSize: table.pageSize,
              total: filteredCountries.length,
              hrefFor: table.pageHref,
              label: (from, to, total) => `${from}-${to} sur ${total} pays`
            }}
          />
        </>
      ) : null}

      {countries.status === "success" ? <div id="creer-pays"><CreateCountryForm regimes={regimeChoices} /></div> : null}
    </PageStack>
  );
}
