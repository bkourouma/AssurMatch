import { redirect } from "next/navigation";
import { AGENCY_DISPLAY_HINT, AGENCY_PARAM, agencyQuery, resolveAgencyFilter } from "../../lib/agency-filter";
import { loadAgencyFilter } from "../../lib/agency-filter-loader";
import { loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { listCrmLeads, readBrokerTeam } from "../../lib/broker-api";
import { canExportCrmLeads } from "../../lib/broker-permissions";
import {
  CRM_LIST_PAGE_SIZE,
  CRM_SOURCE_LABELS,
  CRM_SOURCES,
  CRM_URGENCIES,
  CRM_URGENCY_LABELS,
  PRIORITY_LEVEL_LABELS,
  buildCrmLeadsApiQuery,
  countCrmFilters,
  parseCrmListParams,
  showPriorityColumn,
  withCrmDateRange
} from "../../lib/crm-list-query";
import { crmExportHref } from "../../lib/lead-export-links";
import { CRM_PIPELINE_STATUSES, crmStatusLabel } from "../../lib/lead-vocabulary";
import { teamAdvisorOptions } from "../../lib/team-options";
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
  readTableParams
} from "../../lib/ui/broker-ui";
import type { DataTableColumn } from "../../lib/ui/broker-ui";
import { leadSummary } from "../../lib/ui/broker-view-models";
import type { LeadSummaryViewModel } from "../../lib/ui/broker-view-models";

type QueryParams = Record<string, string | string[] | undefined>;

/** Row of the table: the lead plus the advisor name resolved from the cabinet team (never the raw id). */
interface CrmListRow extends LeadSummaryViewModel {
  advisorName: string;
}

function priorityTone(level: LeadSummaryViewModel["priorityLevel"]): "success" | "warning" | "info" | "neutral" {
  if (level === "high") return "warning";
  if (level === "medium") return "info";
  return "neutral";
}

/** Columns of the list. The « Priorité IA » column is added when the priority sort is active or when a lead of the page carries a score. */
function crmColumns(withPriority: boolean): Array<DataTableColumn<CrmListRow>> {
  const columns: Array<DataTableColumn<CrmListRow>> = [
    { key: "reference", header: "Référence", render: (lead) => lead.reference },
    { key: "country", header: "Pays", render: (lead) => lead.country },
    { key: "product", header: "Produit", render: (lead) => lead.product },
    {
      key: "status",
      header: "Statut",
      render: (lead) => <StatusBadge status={lead.status} labels={crmStatusLabels} tones={{ [lead.status]: lead.statusTone }} />,
      sortable: true
    },
    { key: "date", header: "Date", render: (lead) => lead.assignedAt, sortable: true },
    { key: "advisor", header: "Conseiller", render: (lead) => lead.advisorName },
    { key: "urgency", header: "Urgence", render: (lead) => (lead.urgency ? CRM_URGENCY_LABELS[lead.urgency] ?? lead.urgency : "-"), sortable: true },
    { key: "source", header: "Source", render: (lead) => (lead.source ? CRM_SOURCE_LABELS[lead.source] ?? lead.source : "-") }
  ];
  if (withPriority) {
    columns.push({
      key: "priority",
      header: (
        <>
          Priorité IA <small>(assistance IA, indicatif)</small>
        </>
      ),
      sortable: true,
      render: (lead) =>
        typeof lead.priorityScore === "number" ? (
          <Cluster>
            <Badge tone={priorityTone(lead.priorityLevel)}>{lead.priorityLevel ? PRIORITY_LEVEL_LABELS[lead.priorityLevel] : "Indicative"}</Badge>
            <span>{lead.priorityScore}/100</span>
          </Cluster>
        ) : (
          "-"
        )
    });
  }
  return columns;
}

export default async function BrokerCrmLeadsPage({ searchParams }: { searchParams?: Promise<QueryParams> }) {
  const params = searchParams ? await searchParams : {};
  // Spec 064: Enterprise agency DISPLAY filter (no access restriction); other plans make no extra API call.
  const session = await readBackOfficeSession();
  const agency = session.status === "authenticated" ? await loadAgencyFilter(session.profile, params[AGENCY_PARAM]) : resolveAgencyFilter({ agencies: [] });
  // Lot 3 (spec 069 FR-007): filters, sort and pagination are sent to the API; nothing is filtered in the browser.
  const state = parseCrmListParams(params);
  const [apiLeads, team] = await Promise.all([listCrmLeads(agencyQuery(agency), buildCrmLeadsApiQuery(state)), readBrokerTeam()]);
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

  // The team read is best effort (a role without team right gets 403): the advisor filter is then hidden.
  const members = team.status === "success" ? team.data : [];
  const advisorOptions = [{ value: "", label: "Tous" }, ...teamAdvisorOptions(members)];
  const knownMembers = new Map(members.map((member) => [member.id, member.displayName] as const));
  const leads = apiLeads.data.items.map(leadSummary);
  const rows: CrmListRow[] = leads.map((lead) => ({
    ...lead,
    advisorName: lead.advisor ? knownMembers.get(lead.advisor) ?? "Conseiller hors équipe" : "Non assigné"
  }));
  // Spec 064 FR-002: the export button is shown only to roles holding broker_crm:export (API re-checks and audits).
  const canExport = session.status === "authenticated" && canExportCrmLeads(session.profile);

  const { status, product, country, advisor, urgency, source, dateFrom, dateTo } = state;
  const query = state.search;
  const activeCount = countCrmFilters(state) + (agency.enabled && agency.selected !== "all" ? 1 : 0);

  const exportHref = withCrmDateRange(crmExportHref({ status, product, country, advisor, urgency, source, search: query, agencyId: agency.apiAgencyId }), state);

  const total = typeof apiLeads.data.total === "number" ? apiLeads.data.total : leads.length;
  const page = typeof apiLeads.data.page === "number" ? apiLeads.data.page : state.page;
  const pageSize = typeof apiLeads.data.pageSize === "number" ? apiLeads.data.pageSize : CRM_LIST_PAGE_SIZE;
  const table = readTableParams(params, { pathname: "/crm/leads", defaultSort: { key: "date", direction: "desc" }, pageSize });
  const columns = crmColumns(showPriorityColumn(state, leads));

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
              <Button href={exportHref} variant="secondary" size="sm">Exporter (CSV)</Button>
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
        resetLabel="Réinitialiser"
        resetHref="/crm/leads"
        activeCount={activeCount}
        autoSubmit
      >
        <Field id="crm-status" label="Statut">
          <Select
            id="crm-status"
            name="status"
            defaultValue={status}
            options={[{ value: "", label: "Tous" }, ...CRM_PIPELINE_STATUSES.map((value) => ({ value, label: crmStatusLabel(value) }))]}
          />
        </Field>
        <Field id="crm-product" label="Produit" hint="Saisissez la clé exacte du produit (ex. auto). Aucun résultat si elle n'existe pas dans vos leads.">
          <Input id="crm-product" name="product" type="search" defaultValue={product} placeholder="Clé produit, ex. auto" maxLength={64} />
        </Field>
        <Field id="crm-country" label="Pays" hint="Code pays à 2 lettres (ex. CI pour la Côte d'Ivoire).">
          <Input id="crm-country" name="country" type="search" defaultValue={country} placeholder="Code pays, ex. CI" maxLength={2} />
        </Field>
        <Field id="crm-date-from" label="Date de début">
          <Input id="crm-date-from" name="dateFrom" type="date" defaultValue={dateFrom} />
        </Field>
        <Field id="crm-date-to" label="Date de fin">
          <Input id="crm-date-to" name="dateTo" type="date" defaultValue={dateTo} />
        </Field>
        {team.status === "success" ? (
          <Field id="crm-advisor" label="Conseiller">
            <Select id="crm-advisor" name="advisor" defaultValue={advisor} options={advisorOptions} />
          </Field>
        ) : null}
        <Field id="crm-urgency" label="Urgence">
          <Select
            id="crm-urgency"
            name="urgency"
            defaultValue={urgency}
            options={[{ value: "", label: "Toutes" }, ...CRM_URGENCIES.map((value) => ({ value, label: CRM_URGENCY_LABELS[value] ?? value }))]}
          />
        </Field>
        <Field id="crm-source" label="Source">
          <Select
            id="crm-source"
            name="source"
            defaultValue={source}
            options={[{ value: "", label: "Toutes" }, ...CRM_SOURCES.map((value) => ({ value, label: CRM_SOURCE_LABELS[value] ?? value }))]}
          />
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
            maxLength={120}
            placeholder="Nom, reference, telephone ou email selon permission"
          />
        </Field>
        {/* The sort survives a filter change; a new filter always restarts at page 1. */}
        {params.sort ? <input type="hidden" name="sort" value={state.sort} /> : null}
        {params.sort ? <input type="hidden" name="dir" value={state.direction} /> : null}
      </FilterBar>

      {apiLeads.error ? <Notice tone="warning">API CRM indisponible. Aucune donnee protegee n'est affichee en mode erreur.</Notice> : null}

      <DataTable
        columns={columns}
        items={rows}
        getKey={(lead) => lead.id}
        aria-label="Leads CRM"
        emptyLabel={activeCount > 0 ? "Aucun résultat pour ce filtre : modifiez ou réinitialisez les filtres (produit et pays attendent une clé produit et un code pays exacts)." : "Aucun lead CRM autorisé à afficher."}
        getRowHref={(lead) => `/crm/leads/${lead.id}`}
        sort={{ key: state.sort, direction: state.direction }}
        sortHref={table.sortHref}
        pagination={{
          page,
          pageSize,
          total,
          hrefFor: table.pageHref,
          label: (from, to, count) => `${from}-${to} sur ${count} lead(s)`
        }}
      />
    </PageStack>
  );
}
