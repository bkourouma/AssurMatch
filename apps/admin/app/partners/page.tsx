import { readPartnerSla, type AdminPartnerSlaRowData } from "../lib/admin-api";
import {
  Badge,
  Card,
  DataTable,
  Grid,
  PageHeader,
  PageStack,
  StateMessage,
  paginateItems,
  readTableParams,
  sortItems
} from "../lib/ui/admin-ui";
import type { DataTableColumn } from "../lib/ui/admin-ui";

const columns: Array<DataTableColumn<AdminPartnerSlaRowData>> = [
  { key: "partner", header: "Partenaire", render: (row) => <strong>{row.partnerName}</strong>, sortable: true, sortValue: (row) => row.partnerName },
  { key: "plan", header: "Plan", render: (row) => row.plan, sortable: true, sortValue: (row) => row.plan },
  { key: "target", header: "Objectif", render: (row) => `${row.firstActionTargetMinutes} min`, numeric: true, align: "right", sortable: true, sortValue: (row) => row.firstActionTargetMinutes },
  { key: "measured", header: "Leads mesures", render: (row) => row.leadsMeasured, numeric: true, align: "right", sortable: true, sortValue: (row) => row.leadsMeasured },
  { key: "withinTarget", header: "Dans l'objectif", render: (row) => row.leadsWithinTarget, numeric: true, align: "right", sortable: true, sortValue: (row) => row.leadsWithinTarget },
  {
    key: "rate",
    header: "Taux",
    render: (row) => <Badge tone={row.complianceRate >= 0.8 ? "info" : "warning"}>{Math.round(row.complianceRate * 100)}%</Badge>,
    sortable: true,
    sortValue: (row) => row.complianceRate
  },
  {
    key: "average",
    header: "Delai moyen",
    render: (row) => (row.averageFirstActionMinutes === null ? "-" : `${row.averageFirstActionMinutes} min`),
    numeric: true,
    align: "right",
    sortable: true,
    sortValue: (row) => row.averageFirstActionMinutes
  }
];

export default async function PartnerCompliancePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const sla = await readPartnerSla();
  const items: AdminPartnerSlaRowData[] = sla.status === "success" ? sla.data : [];

  const table = readTableParams(params, {
    pathname: "/partners",
    defaultSort: { key: "partner", direction: "asc" },
    pageSize: 25
  });
  const rows = paginateItems(sortItems(items, columns, table.sort), table.page, table.pageSize);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Partenaires" }, { label: "Partenaires" }]}
        kicker="Conformite partenaires"
        title="Partenaires courtiers"
        description="Suivi des partenaires, licences et agrements sans modification des controles existants."
      />
      <Grid columns="two">
        <Card
          title="Licences et agrements"
          description="Activation bloquee sans licence valide, preuve d'agrement acceptee et audit de conformite."
        >
          <Badge tone="warning">Licence expiree = blocage existant</Badge>
        </Card>
        <Card
          title="Actions disponibles"
          description="Aucune action destructive ou nouvelle activation n'est ajoutee par cette interface."
        >
          <Badge tone="disabled">Lecture operationnelle</Badge>
        </Card>
      </Grid>
      <Card
        title="Engagement de reactivite (SLA) par partenaire"
        description="Delai de premiere action mesure sur les 30 derniers jours. Indicateur de suivi: aucune suspension automatique n'est declenchee par ce tableau."
      >
        <DataTable
          columns={columns}
          items={rows}
          getKey={(row) => row.partnerTenantId}
          emptyLabel="Aucun partenaire mesure."
          aria-label="Engagement de reactivite par partenaire"
          sort={table.sort}
          sortHref={table.sortHref}
          pagination={{
            page: table.page,
            pageSize: table.pageSize,
            total: items.length,
            hrefFor: table.pageHref,
            label: (from, to, total) => `${from}-${to} sur ${total} partenaires`
          }}
        />
      </Card>
      <StateMessage>Les donnees partenaires detaillees restent servies par les pages et API existantes.</StateMessage>
    </PageStack>
  );
}
