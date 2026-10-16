import { redirect } from "next/navigation";
import { AGENCY_DISPLAY_HINT, AGENCY_PARAM, agencyQuery, resolveAgencyFilter } from "../../lib/agency-filter";
import { loadAgencyFilter } from "../../lib/agency-filter-loader";
import { loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { listCrmLeads } from "../../lib/broker-api";
import { canExportCrmLeads } from "../../lib/broker-permissions";
import { crmExportHref } from "../../lib/lead-export-links";
import { crmStatusLabel } from "../../lib/lead-vocabulary";
import {
  Badge,
  Button,
  Cluster,
  DataTable,
  Field,
  FilterBar,
  Input,
  Notice,
  PageHeader,
  PageStack,
  Select,
  StatusBadge,
  crmStatusLabels,
  paginateItems,
  readTableParams,
  sortItems
} from "../../lib/ui/broker-ui";
import type { DataTableColumn } from "../../lib/ui/broker-ui";
import { leadSummary } from "../../lib/ui/broker-view-models";
import type { LeadSummaryViewModel } from "../../lib/ui/broker-view-models";

type QueryParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

/** Options d'un filtre: l'entree neutre d'abord, puis les valeurs reellement presentes. */
function optionsOf(
  leads: LeadSummaryViewModel[],
  pick: (lead: LeadSummaryViewModel) => string,
  allLabel: string,
  label?: (value: string) => string
) {
  const values = [...new Set(leads.map(pick))].filter((value) => value && value !== "-").sort();
  return [{ value: "", label: allLabel }, ...values.map((value) => ({ value, label: label ? label(value) : value }))];
}

const columns: Array<DataTableColumn<LeadSummaryViewModel>> = [
  { key: "reference", header: "Reference", render: (lead) => lead.reference, sortable: true, sortValue: (lead) => lead.reference },
  { key: "country", header: "Pays", render: (lead) => lead.country },
  { key: "product", header: "Produit", render: (lead) => lead.product, sortable: true, sortValue: (lead) => lead.product },
  {
    key: "status",
    header: "Statut",
    render: (lead) => <StatusBadge status={lead.status} labels={crmStatusLabels} tones={{ [lead.status]: lead.statusTone }} />,
    sortable: true,
    sortValue: (lead) => crmStatusLabel(lead.status)
  },
  { key: "date", header: "Date", render: (lead) => lead.assignedAt, sortable: true, sortValue: (lead) => lead.assignedAt },
  { key: "advisor", header: "Conseiller", render: (lead) => lead.advisor ?? "-" },
  { key: "urgency", header: "Urgence", render: (lead) => lead.urgency ?? "-" },
  { key: "source", header: "Source", render: (lead) => lead.source ?? "-" }
];

export default async function BrokerCrmLeadsPage({ searchParams }: { searchParams?: Promise<QueryParams> }) {
  const params = searchParams ? await searchParams : {};
  // Spec 064: Enterprise agency DISPLAY filter (no access restriction); other plans make no extra API call.
  const session = await readBackOfficeSession();
  const agency = session.status === "authenticated" ? await loadAgencyFilter(session.profile, params[AGENCY_PARAM]) : resolveAgencyFilter({ agencies: [] });
  const apiLeads = await listCrmLeads(agencyQuery(agency));
  if (apiLeads.unauthenticated) redirect(loginRedirect("/crm/leads", apiLeads.error ?? "session_required"));
  if (apiLeads.forbidden) {
    return (
      <PageStack>
        <Notice tone="danger" title="Acces CRM refuse">
          Acces CRM refuse, verifiez le plan, la MFA et le flag broker_crm_enabled. Aucune donnee CRM n'est affichee.
        </Notice>
      </PageStack>
    );
  }

  const leads = apiLeads.data.items.map(leadSummary);
  // Spec 064 FR-002: the export button is shown only to roles holding broker_crm:export (API re-checks and audits).
  const canExport = session.status === "authenticated" && canExportCrmLeads(session.profile);

  const status = firstParam(params.status);
  const product = firstParam(params.product);
  const country = firstParam(params.country);
  const date = firstParam(params.date);
  const advisor = firstParam(params.advisor);
  const urgency = firstParam(params.urgency);
  const source = firstParam(params.source);
  const query = firstParam(params.q).trim().toLowerCase();
  const activeCount = [status, product, country, date, advisor, urgency, source, query].filter(Boolean).length + (agency.enabled && agency.selected !== "all" ? 1 : 0);

  const filtered = leads.filter(
    (lead) =>
      (!status || lead.status === status) &&
      (!product || lead.product === product) &&
      (!country || lead.country === country) &&
      (!date || lead.assignedAt === date) &&
      (!advisor || lead.advisor === advisor) &&
      (!urgency || lead.urgency === urgency) &&
      (!source || lead.source === source) &&
      (!query || lead.reference.toLowerCase().includes(query))
  );

  const table = readTableParams(params, { pathname: "/crm/leads", defaultSort: { key: "date", direction: "desc" }, pageSize: 25 });
  const visible = paginateItems(sortItems(filtered, columns, table.sort), table.page, table.pageSize);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "CRM", href: "/crm" }, { label: "Vue tableau" }]}
        kicker="CRM Pro/Enterprise"
        title="Leads CRM"
        description="Vue tableau des leads autorises selon role, tenant, conseiller et permissions PII."
        actions={
          canExport ? (
            <Cluster>
              <Button href={crmExportHref({ status, product, country, date, advisor, urgency, source, search: query, agencyId: agency.apiAgencyId })} variant="secondary" size="sm">Exporter (CSV)</Button>
              <Badge tone="info">Export audité</Badge>
            </Cluster>
          ) : (
            <Badge tone="disabled">Export non autorisé pour votre rôle</Badge>
          )
        }
      />

      <FilterBar
        action="/crm/leads"
        label="Filtres CRM"
        submitLabel="Filtrer"
        resetLabel="Reinitialiser"
        resetHref="/crm/leads"
        activeCount={activeCount}
        autoSubmit
      >
        <Field id="crm-status" label="Statut">
          <Select id="crm-status" name="status" defaultValue={status} options={optionsOf(leads, (lead) => lead.status, "Tous", crmStatusLabel)} />
        </Field>
        <Field id="crm-product" label="Produit">
          <Select id="crm-product" name="product" defaultValue={product} options={optionsOf(leads, (lead) => lead.product, "Tous")} />
        </Field>
        <Field id="crm-country" label="Pays">
          <Select id="crm-country" name="country" defaultValue={country} options={optionsOf(leads, (lead) => lead.country, "Tous")} />
        </Field>
        <Field id="crm-date" label="Date">
          <Select id="crm-date" name="date" defaultValue={date} options={optionsOf(leads, (lead) => lead.assignedAt, "Toutes")} />
        </Field>
        <Field id="crm-advisor" label="Conseiller">
          <Select id="crm-advisor" name="advisor" defaultValue={advisor} options={optionsOf(leads, (lead) => lead.advisor ?? "", "Tous")} />
        </Field>
        <Field id="crm-urgency" label="Urgence">
          <Select id="crm-urgency" name="urgency" defaultValue={urgency} options={optionsOf(leads, (lead) => lead.urgency ?? "", "Toutes")} />
        </Field>
        <Field id="crm-source" label="Source">
          <Select id="crm-source" name="source" defaultValue={source} options={optionsOf(leads, (lead) => lead.source ?? "", "Toutes")} />
        </Field>
        {agency.enabled ? (
          <Field id="crm-agency" label="Agence" hint={AGENCY_DISPLAY_HINT}>
            <Select id="crm-agency" name={AGENCY_PARAM} defaultValue={agency.selected} options={agency.options} />
          </Field>
        ) : null}
        <Field id="crm-search" label="Recherche autorisee">
          <Input
            id="crm-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Nom, reference, telephone ou email selon permission"
          />
        </Field>
      </FilterBar>

      {apiLeads.error ? <Notice tone="warning">API CRM indisponible. Aucune donnee protegee n'est affichee en mode erreur.</Notice> : null}

      <DataTable
        columns={columns}
        items={visible}
        getKey={(lead) => lead.id}
        aria-label="Leads CRM"
        emptyLabel="Aucun lead CRM autorise a afficher."
        getRowHref={(lead) => `/crm/leads/${lead.id}`}
        sort={table.sort}
        sortHref={table.sortHref}
        pagination={{
          page: table.page,
          pageSize: table.pageSize,
          total: filtered.length,
          hrefFor: table.pageHref,
          label: (from, to, total) => `${from}-${to} sur ${total} lead(s)`
        }}
      />
    </PageStack>
  );
}
