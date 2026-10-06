import { redirect } from "next/navigation";
import {
  readAdminCountries,
  readAdminPartnerApplications,
  type AdminPartnerApplicationData
} from "../../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { adminReadErrorMessage } from "../../lib/catalog-messages";
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_OPTIONS,
  APPLICATION_STATUS_TONES,
  PARTNER_PLAN_LABELS,
  partnerFormatDate
} from "../../lib/partner-messages";
import {
  Button,
  Card,
  DataTable,
  Field,
  FilterBar,
  PageHeader,
  PageStack,
  Select,
  StateMessage,
  StatusBadge,
  fieldControlProps,
  paginateItems,
  readTableParams,
  sortItems
} from "../../lib/ui/admin-ui";
import type { DataTableColumn } from "../../lib/ui/admin-ui";

/**
 * Spec 051 US5/US7: broker applications received from the public site. Reading never activates
 * anything; conversion and refusal are compliance decisions taken on the detail page.
 */
function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function PartnerApplicationsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/partners/applications", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/partners/applications")}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Fpartners%2Fapplications");

  const params = searchParams ? await searchParams : {};
  const statusParam = firstParam(params.status);
  const countryParam = firstParam(params.countryId);
  const status = (APPLICATION_STATUS_OPTIONS as readonly string[]).includes(statusParam) ? statusParam as (typeof APPLICATION_STATUS_OPTIONS)[number] : undefined;
  const countryId = /^[0-9a-f-]{36}$/i.test(countryParam) ? countryParam : undefined;

  const [applications, countries] = await Promise.all([
    readAdminPartnerApplications({ status, countryId }),
    readAdminCountries()
  ]);
  if (applications.unauthenticated) redirect(loginRedirect("/partners/applications", applications.error ?? "session_required"));
  const countryById = new Map(countries.data.map((country) => [country.id, country]));

  const columns: Array<DataTableColumn<AdminPartnerApplicationData>> = [
    {
      key: "applicant",
      header: "Candidat",
      render: (application) => (
        <>
          <a href={`/partners/applications/${encodeURIComponent(application.id)}`}><strong>{application.tradeName || application.legalName}</strong></a>
          <div>{application.publicReference}</div>
        </>
      ),
      sortable: true,
      sortValue: (application) => application.tradeName || application.legalName
    },
    {
      key: "country",
      header: "Pays",
      render: (application) => countryById.get(application.countryId)?.isoCode ?? "?",
      sortable: true,
      sortValue: (application) => countryById.get(application.countryId)?.isoCode ?? ""
    },
    { key: "plan", header: "Plan souhaité", render: (application) => PARTNER_PLAN_LABELS[application.desiredPlan as keyof typeof PARTNER_PLAN_LABELS] ?? application.desiredPlan },
    {
      key: "status",
      header: "Statut",
      render: (application) => <StatusBadge status={application.status} labels={APPLICATION_STATUS_LABELS} tones={APPLICATION_STATUS_TONES} />,
      sortable: true,
      sortValue: (application) => application.status
    },
    { key: "license", header: "Licence déclarée", render: (application) => `${application.licenseNumber} (exp. ${partnerFormatDate(application.licenseExpiresAt)})` },
    { key: "received", header: "Reçue le", render: (application) => partnerFormatDate(application.createdAt), sortable: true, sortValue: (application) => application.createdAt }
  ];

  const table = readTableParams(params, {
    pathname: "/partners/applications",
    defaultSort: { key: "received", direction: "desc" },
    pageSize: 25
  });
  const rows = paginateItems(sortItems(applications.data, columns, table.sort), table.page, table.pageSize);
  const activeFilters = [status, countryId].filter(Boolean).length;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Partenaires" }, { label: "Courtiers", href: "/partners" }, { label: "Candidatures" }]}
        kicker="Conformite partenaires"
        title="Candidatures courtiers"
        description="Candidatures déposées depuis le site public. Une candidature n'active jamais un courtier : la conversion crée un Prospect à compléter."
        actions={<Button href="/partners" variant="secondary">Annuaire des courtiers</Button>}
      />
      <Card title="Candidatures">
        <FilterBar
          action="/partners/applications"
          label="Filtres candidatures"
          submitLabel="Filtrer"
          resetLabel="Reinitialiser"
          resetHref="/partners/applications"
          activeCount={activeFilters}
          autoSubmit
        >
          <Field id="applications-status" label="Statut">
            <Select {...fieldControlProps("applications-status")} name="status" defaultValue={status ?? ""}>
              <option value="">Tous</option>
              {APPLICATION_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{APPLICATION_STATUS_LABELS[option]}</option>)}
            </Select>
          </Field>
          <Field id="applications-country" label="Pays">
            <Select {...fieldControlProps("applications-country")} name="countryId" defaultValue={countryId ?? ""}>
              <option value="">Tous</option>
              {countries.data.map((country) => <option key={country.id} value={country.id}>{`${country.name} (${country.isoCode})`}</option>)}
            </Select>
          </Field>
        </FilterBar>
        {applications.forbidden ? <StateMessage tone="danger">{adminReadErrorMessage("access_denied")}</StateMessage> : null}
        {applications.status === "error" ? <StateMessage tone="danger">{adminReadErrorMessage(applications.error)}</StateMessage> : null}
        <DataTable
          columns={columns}
          items={rows}
          getKey={(application) => application.id}
          emptyLabel="Aucune candidature pour ces filtres."
          aria-label="Candidatures courtiers"
          sort={table.sort}
          sortHref={table.sortHref}
          pagination={{
            page: table.page,
            pageSize: table.pageSize,
            total: applications.data.length,
            hrefFor: table.pageHref,
            label: (from, to, total) => `${from}-${to} sur ${total} candidatures`
          }}
        />
      </Card>
    </PageStack>
  );
}
