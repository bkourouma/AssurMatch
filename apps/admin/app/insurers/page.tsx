import { redirect } from "next/navigation";
import { readAdminCountries } from "../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { adminReadErrorMessage } from "../lib/catalog-messages";
import { readAdminInsurers, type AdminInsurerView } from "../lib/lot4-offers-api";
import { INSURER_STATUS_LABELS, INSURER_STATUS_OPTIONS, INSURER_STATUS_TONES } from "../lib/offer-messages";
import {
  Button,
  Card,
  DataTable,
  Field,
  FilterBar,
  Notice,
  PageHeader,
  PageStack,
  Select,
  StateMessage,
  StatusBadge,
  fieldControlProps,
  paginateItems,
  readTableParams,
  sortItems
} from "../lib/ui/admin-ui";
import type { DataTableColumn } from "../lib/ui/admin-ui";

/**
 * Spec 070 (PRD section 8): insurer referential, per country. Filtered list (country, status); an
 * offer links to an active insurer of its country. The API restricts the list to the operator scope.
 */
const UUID = /^[0-9a-f-]{36}$/i;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function AdminInsurersPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/insurers", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/insurers")}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Finsurers");

  const params = searchParams ? await searchParams : {};
  const countryId = UUID.test(firstParam(params.countryId)) ? firstParam(params.countryId) : undefined;
  const statusParam = firstParam(params.status);
  const status = (INSURER_STATUS_OPTIONS as readonly string[]).includes(statusParam) ? statusParam as AdminInsurerView["status"] : undefined;

  const [insurers, countries] = await Promise.all([readAdminInsurers({ countryId, status }), readAdminCountries()]);
  if (insurers.status === "unauthenticated") redirect(loginRedirect("/insurers", insurers.error ?? "session_required"));
  const countryById = new Map(countries.data.map((country) => [country.id, country]));

  const columns: Array<DataTableColumn<AdminInsurerView>> = [
    {
      key: "name",
      header: "Assureur",
      render: (insurer) => <a href={`/insurers/${encodeURIComponent(insurer.id)}`}><strong>{insurer.name}</strong></a>,
      sortable: true,
      sortValue: (insurer) => insurer.name
    },
    { key: "code", header: "Code", render: (insurer) => <code>{insurer.code}</code>, sortable: true, sortValue: (insurer) => insurer.code },
    {
      key: "country",
      header: "Pays",
      render: (insurer) => countryById.get(insurer.countryId)?.name ?? insurer.countryId.slice(0, 8),
      sortable: true,
      sortValue: (insurer) => countryById.get(insurer.countryId)?.name ?? ""
    },
    { key: "approval", header: "Agrément", render: (insurer) => insurer.approvalNumber ?? "-" },
    {
      key: "status",
      header: "Statut",
      render: (insurer) => <StatusBadge status={insurer.status} labels={INSURER_STATUS_LABELS} tones={INSURER_STATUS_TONES} />,
      sortable: true,
      sortValue: (insurer) => insurer.status
    }
  ];

  const table = readTableParams(params, { pathname: "/insurers", defaultSort: { key: "name", direction: "asc" }, pageSize: 25 });
  const rows = paginateItems(sortItems(insurers.data, columns, table.sort), table.page, table.pageSize);
  const activeFilters = [countryId, status].filter((value) => value !== undefined).length;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue", href: "/catalog" }, { label: "Assureurs" }]}
        kicker="Catalogue"
        title="Assureurs"
        description="Référentiel des assureurs par pays. Une offre peut être liée à un assureur actif du pays de l'offre ; un assureur suspendu ou retiré ne peut plus être choisi."
        actions={<Button href="/insurers/new">Nouvel assureur</Button>}
      />
      <Notice tone="info">Le code d&apos;un assureur est unique par pays et définitif. Chaque modification est auditée avec son motif.</Notice>
      <Card title="Référentiel des assureurs">
        <FilterBar action="/insurers" label="Filtres assureurs" submitLabel="Filtrer" resetLabel="Réinitialiser" resetHref="/insurers" activeCount={activeFilters}>
          <Field id="insurers-country" label="Pays">
            <Select {...fieldControlProps("insurers-country")} name="countryId" defaultValue={countryId ?? ""}>
              <option value="">Tous</option>
              {countries.data.map((country) => <option key={country.id} value={country.id}>{`${country.name} (${country.isoCode})`}</option>)}
            </Select>
          </Field>
          <Field id="insurers-status" label="Statut">
            <Select {...fieldControlProps("insurers-status")} name="status" defaultValue={status ?? ""}>
              <option value="">Tous</option>
              {INSURER_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{INSURER_STATUS_LABELS[option]}</option>)}
            </Select>
          </Field>
        </FilterBar>
        {insurers.status === "forbidden" ? <StateMessage tone="danger">{adminReadErrorMessage("access_denied")}</StateMessage> : null}
        {insurers.status === "error" ? <StateMessage tone="danger">{adminReadErrorMessage(insurers.error)}</StateMessage> : null}
        <DataTable
          columns={columns}
          items={rows}
          getKey={(insurer) => insurer.id}
          emptyLabel="Aucun assureur pour ces filtres."
          aria-label="Assureurs"
          sort={table.sort}
          sortHref={table.sortHref}
          pagination={{
            page: table.page,
            pageSize: table.pageSize,
            total: insurers.data.length,
            hrefFor: table.pageHref,
            label: (from, to, total) => `${from}-${to} sur ${total} assureurs`
          }}
        />
      </Card>
    </PageStack>
  );
}
