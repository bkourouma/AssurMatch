import { redirect } from "next/navigation";
import { listStarterLeads } from "../lib/broker-api";
import { loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { canExportStarterLeads } from "../lib/broker-permissions";
import { starterExportHref } from "../lib/lead-export-links";
import { starterStatusLabel } from "../lib/lead-vocabulary";
import { productLabel } from "../lib/product-vocabulary";
import {
  Badge,
  Button,
  Cluster,
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
  { key: "reference", header: "Référence", render: (lead) => <span className="bo-ref">{lead.reference}</span>, sortable: true, sortValue: (lead) => lead.reference },
  { key: "country", header: "Pays", render: (lead) => lead.country },
  { key: "product", header: "Produit", render: (lead) => productLabel(lead.product), sortable: true, sortValue: (lead) => productLabel(lead.product) },
  {
    key: "status",
    header: "Statut",
    render: (lead) => <StatusBadge status={lead.status} labels={starterStatusLabels} tones={{ [lead.status]: lead.statusTone }} />,
    sortable: true,
    sortValue: (lead) => starterStatusLabel(lead.status)
  },
  { key: "date", header: "Date", render: (lead) => lead.assignedAt, sortable: true, sortValue: (lead) => lead.assignedAt },
  { key: "seen", header: "Vu", render: (lead) => (lead.seen === "Oui" ? "Oui" : <Badge tone="info">Non vu</Badge>) }
];

export default async function BrokerLeadsPage({ searchParams }: { searchParams?: Promise<QueryParams> }) {
  const params = searchParams ? await searchParams : {};
  const apiLeads = await listStarterLeads();
  if (apiLeads.unauthenticated) redirect(loginRedirect("/leads", apiLeads.error ?? "session_required"));
  const leads = apiLeads.data.items.map(leadSummary);
  // Spec 064 FR-001: the export button is shown only to roles holding broker_leads:export (API re-checks and audits).
  const session = await readBackOfficeSession();
  const canExport = session.status === "authenticated" && canExportStarterLeads(session.profile);

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
        breadcrumb={[{ label: "Activité", href: "/" }, { label: "Leads" }]}
        title="Leads assignés"
        description="Le courtier voit uniquement les leads qui lui sont assignés. Les données personnelles ne sont affichées qu'après contrôle du tenant connecté."
        actions={
          canExport ? (
            <Cluster>
              <Button href={starterExportHref({ status, product, country, date })} variant="secondary" size="sm">Exporter (CSV)</Button>
              <Badge tone="info">Export audité</Badge>
            </Cluster>
          ) : (
            <Badge tone="disabled">Export non autorisé pour votre rôle</Badge>
          )
        }
      />

      <FilterBar
        action="/leads"
        label="Filtres leads"
        submitLabel="Filtrer"
        resetLabel="Réinitialiser"
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
          <Select id="leads-product" name="product" defaultValue={product} options={optionsOf(leads, (lead) => lead.product, "Tous", productLabel)} />
        </Field>
        <Field id="leads-country" label="Pays">
          <Select id="leads-country" name="country" defaultValue={country} options={optionsOf(leads, (lead) => lead.country, "Tous")} />
        </Field>
        <Field id="leads-date" label="Date">
          <Select id="leads-date" name="date" defaultValue={date} options={optionsOf(leads, (lead) => lead.assignedAt, "Toutes")} />
        </Field>
      </FilterBar>

      {apiLeads.forbidden ? (
        <Notice tone="danger">Accès refusé ou MFA requis pour ce portail. Aucune donnée protégée n'est affichée.</Notice>
      ) : null}
      {apiLeads.error && !apiLeads.forbidden ? (
        <Notice tone="warning">API leads indisponible. Aucune donnée protégée n'est affichée en mode erreur.</Notice>
      ) : null}

      {!apiLeads.forbidden ? (
        <DataTable
          columns={columns}
          items={visible}
          getKey={(lead) => lead.id}
          aria-label="Leads assignés"
          emptyLabel="Aucun lead autorisé à afficher."
          emptyDescription={
            activeCount > 0
              ? "Aucun lead ne correspond à ces filtres. Réinitialisez-les pour revoir tous vos leads."
              : "Les leads qu'AssurMatch vous assigne apparaissent ici, avec une notification. Ouvrez-en un pour l'accepter ou le rejeter."
          }
          emptyAction={activeCount > 0 ? <Button href="/leads" variant="secondary" size="sm">Réinitialiser les filtres</Button> : undefined}
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

      <Notice tone="neutral" title="Limites Starter">
        Aucun Kanban, assignation équipe ou CRM avancé n'est active pour le portail Starter. Le CRM complet est disponible avec le plan Pro.
        Export contrôle par permission et audit.
      </Notice>
    </PageStack>
  );
}
