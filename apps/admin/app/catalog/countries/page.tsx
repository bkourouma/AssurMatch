import { redirect } from "next/navigation";
import { readAdminCountries, readRegulatoryRegimes, type AdminCountryData } from "../../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { adminReadErrorMessage, flagLabel } from "../../lib/catalog-messages";
import {
  Badge,
  Card,
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
import { CreateCountryForm } from "../catalog-forms";

const KEY_FLAGS = ["country_public_enabled", "country_quote_enabled", "country_comparison_enabled"] as const;

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

  const columns: Array<DataTableColumn<AdminCountryData>> = [
    {
      key: "iso",
      header: "ISO",
      render: (country) => <a href={`/catalog/countries/${encodeURIComponent(country.id)}`}><strong>{country.isoCode}</strong></a>,
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
        <>
          {KEY_FLAGS.map((key) => (
            <Badge key={key} tone={country.flags[key] ? "warning" : "disabled"}>{`${flagLabel(key)} : ${country.flags[key] ? "ouvert" : "fermé"}`}</Badge>
          ))}
        </>
      )
    }
  ];

  const table = readTableParams(params, { pathname: "/catalog/countries", defaultSort: { key: "iso", direction: "asc" }, pageSize: 25 });
  const rows = paginateItems(sortItems(countries.data, columns, table.sort), table.page, table.pageSize);
  const regimeChoices = regimes.data.filter((regime) => regime.status !== "retired").map((regime) => ({ value: regime.id, label: `${regime.name} (${regime.key})` }));

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue", href: "/catalog" }, { label: "Pays" }]}
        kicker="Catalogue"
        title="Pays"
        description="Pays administrés dans votre périmètre. Un pays créé reste en brouillon, fermé au public, jusqu'à une ouverture validée par la conformité."
      />

      {countries.forbidden ? <StateMessage tone="danger">{adminReadErrorMessage("access_denied")}</StateMessage> : null}
      {countries.status === "error" ? <StateMessage tone="danger">{adminReadErrorMessage(countries.error)}</StateMessage> : null}

      {countries.status === "success" ? (
        <Card title="Pays">
          <DataTable
            columns={columns}
            items={rows}
            getKey={(country) => country.id}
            emptyLabel="Aucun pays dans votre périmètre."
            aria-label="Pays du catalogue"
            sort={table.sort}
            sortHref={table.sortHref}
            pagination={{
              page: table.page,
              pageSize: table.pageSize,
              total: countries.data.length,
              hrefFor: table.pageHref,
              label: (from, to, total) => `${from}-${to} sur ${total} pays`
            }}
          />
        </Card>
      ) : null}

      {countries.status === "success" ? <CreateCountryForm regimes={regimeChoices} /> : null}
    </PageStack>
  );
}
