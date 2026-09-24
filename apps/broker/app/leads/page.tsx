import { redirect } from "next/navigation";
import { listStarterLeads } from "../lib/broker-api";
import { loginRedirect } from "../lib/backoffice-auth";
import { starterStatusLabel } from "../lib/lead-vocabulary";
import {
  Badge,
  DataTable,
  Field,
  FilterBar,
  Notice,
  PageHeader,
  PageStack,
  Select,
  StatusBadge,
  paginateItems,
  readTableParams,
  sortItems,
  starterStatusLabels
} from "../lib/ui/broker-ui";
import type { DataTableColumn } from "../lib/ui/broker-ui";
import { leadSummary } from "../lib/ui/broker-view-models";
import type { LeadSummaryViewModel } from "../lib/ui/broker-view-models";

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
    render: (lead) => <StatusBadge status={lead.status} labels={starterStatusLabels} tones={{ [lead.status]: lead.statusTone }} />,
    sortable: true,
    sortValue: (lead) => starterStatusLabel(lead.status)
  },
  { key: "date", header: "Date", render: (lead) => lead.assignedAt, sortable: true, sortValue: (lead) => lead.assignedAt },
  { key: "seen", header: "Vu", render: (lead) => lead.seen }
];

export default async function BrokerLeadsPage({ searchParams }: { searchParams?: Promise<QueryParams> }) {
  const params = searchParams ? await searchParams : {};
  const apiLeads = await listStarterLeads();
  if (apiLeads.unauthenticated) redirect(loginRedirect("/leads", apiLeads.error ?? "session_required"));
  const leads = apiLeads.data.items.map(leadSummary);

  const status = firstParam(params.status);
  const product = firstParam(params.product);
  const country = firstParam(params.country);
  const date = firstParam(params.date);
  const activeCount = [status, product, country, date].filter(Boolean).length;

  const filtered = leads.filter(
    (lead) =>
      (!status || lead.status === status) &&
      (!product || lead.product === product) &&
      (!country || lead.country === country) &&
      (!date || lead.assignedAt === date)
  );

  const table = readTableParams(params, { pathname: "/leads", defaultSort: { key: "date", direction: "desc" }, pageSize: 25 });
  const visible = paginateItems(sortItems(filtered, columns, table.sort), table.page, table.pageSize);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Activite", href: "/" }, { label: "Leads" }]}
        kicker="Portail Starter"
        title="Leads assignes"
        description="Le courtier voit uniquement les leads qui lui sont assignes. Les donnees personnelles ne sont affichees qu'apres controle du tenant connecte."
        actions={<Badge tone="info">Export controle par permission et audit</Badge>}
      />

      <FilterBar
        action="/leads"
        label="Filtres leads"
        submitLabel="Filtrer"
        resetLabel="Reinitialiser"
        resetHref="/leads"
        activeCount={activeCount}
        autoSubmit
      >
        <Field id="leads-status" label="Statut">
          <Select
            id="leads-status"
            name="status"
            defaultValue={status}
            options={optionsOf(leads, (lead) => lead.status, "Tous", starterStatusLabel)}
          />
        </Field>
        <Field id="leads-product" label="Produit">
          <Select id="leads-product" name="product" defaultValue={product} options={optionsOf(leads, (lead) => lead.product, "Tous")} />
        </Field>
        <Field id="leads-country" label="Pays">
          <Select id="leads-country" name="country" defaultValue={country} options={optionsOf(leads, (lead) => lead.country, "Tous")} />
        </Field>
        <Field id="leads-date" label="Date">
          <Select id="leads-date" name="date" defaultValue={date} options={optionsOf(leads, (lead) => lead.assignedAt, "Toutes")} />
        </Field>
      </FilterBar>

      {apiLeads.forbidden ? (
        <Notice tone="danger">Acces refuse ou MFA requis pour ce portail. Aucune donnee protegee n'est affichee.</Notice>
      ) : null}
      {apiLeads.error && !apiLeads.forbidden ? (
        <Notice tone="warning">API leads indisponible. Aucune donnee protegee n'est affichee en mode erreur.</Notice>
      ) : null}

      {!apiLeads.forbidden ? (
        <DataTable
          columns={columns}
          items={visible}
          getKey={(lead) => lead.id}
          aria-label="Leads assignes"
          emptyLabel="Aucun lead autorise a afficher."
          getRowHref={(lead) => `/leads/${lead.id}`}
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
      ) : null}

      <Notice tone="info" title="Limites Starter">
        Aucun Kanban, assignation equipe ou CRM avance n'est active pour le portail Starter. Le CRM complet est disponible avec le plan Pro.
      </Notice>
    </PageStack>
  );
}
