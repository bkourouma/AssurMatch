import { DATA_REQUEST_STATUS_KEYS, DATA_REQUEST_TYPE_KEYS, readDataRequests, type DataRequestListItemData } from "../../lib/admin-api";
import { DATA_REQUEST_STATUS_LABELS, DATA_REQUEST_TYPE_LABELS, formatDataRequestDate } from "../../lib/data-request-labels";
import { firstValue, toQueryString } from "../../lib/operations-api";
import { Badge, Button, Card, DataTable, Field, FilterBar, PageHeader, PageStack, Select, Stack, StateMessage, fieldControlProps, type DataTableColumn } from "../../lib/ui/admin-ui";

/**
 * Spec 062 (D-10): queue of the data-subject requests (access, rectification, erasure) created by
 * visitors from their tracking space. The list only carries the reference, the type, the status and
 * the deadlines: the visitor's text stays on the detail page, which the support role never receives.
 */

const columns: Array<DataTableColumn<DataRequestListItemData>> = [
  {
    key: "reference",
    header: "Référence",
    render: (item) => <a href={`/compliance/data-requests/${encodeURIComponent(item.id)}`}><code>{item.reference}</code></a>
  },
  { key: "type", header: "Type", render: (item) => DATA_REQUEST_TYPE_LABELS[item.type] ?? item.type },
  {
    key: "status",
    header: "Statut",
    render: (item) => {
      const known = DATA_REQUEST_STATUS_LABELS[item.status];
      return <Badge tone={known?.tone ?? "neutral"}>{known?.label ?? item.status}</Badge>;
    }
  },
  { key: "createdAt", header: "Reçue le", render: (item) => formatDataRequestDate(item.createdAt) },
  { key: "dueAt", header: "Échéance indicative", render: (item) => formatDataRequestDate(item.dueAt) },
  {
    key: "overdue",
    header: "Retard",
    render: (item) => (item.overdue && (item.status === "received" || item.status === "in_review") ? <Badge tone="danger">En retard</Badge> : "—")
  }
];

export default async function DataRequestsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {};
  const rawStatus = firstValue(params.status);
  const rawType = firstValue(params.type);
  const status = rawStatus && (DATA_REQUEST_STATUS_KEYS as readonly string[]).includes(rawStatus) ? rawStatus : undefined;
  const type = rawType && (DATA_REQUEST_TYPE_KEYS as readonly string[]).includes(rawType) ? rawType : undefined;
  const cursor = firstValue(params.cursor);
  const result = await readDataRequests({
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 25
  });
  const items = result.data.items;
  const nextCursor = result.data.nextCursor;
  const overdueCount = items.filter((item) => item.overdue && (item.status === "received" || item.status === "in_review")).length;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Conformité", href: "/compliance" }, { label: "Demandes de données des visiteurs" }]}
        kicker="Conformité"
        title="Demandes de données des visiteurs"
        description="Demandes d'accès, de rectification ou d'effacement déposées par les visiteurs depuis leur espace de suivi. L'échéance affichée est indicative (30 jours, à confirmer par pays). Aucune donnée n'est effacée automatiquement."
        actions={<Button href="/compliance/retention" variant="secondary">Conservation des données</Button>}
      />

      {result.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {result.forbidden ? <StateMessage tone="danger">Accès refusé : MFA vérifiée et rôle de conformité ou de support requis pour consulter cette file.</StateMessage> : null}
      {result.status === "error" ? <StateMessage tone="danger">File des demandes indisponible : {result.error}</StateMessage> : null}

      <Card>
        <FilterBar
          action="/compliance/data-requests"
          label="Filtres des demandes de données"
          submitLabel="Filtrer"
          resetLabel="Réinitialiser"
          resetHref="/compliance/data-requests"
          activeCount={[status, type].filter(Boolean).length}
          autoSubmit
        >
          <Field id="dr-status" label="Statut">
            <Select
              {...fieldControlProps("dr-status")}
              name="status"
              defaultValue={status ?? ""}
              options={[{ value: "", label: "Tous" }, ...DATA_REQUEST_STATUS_KEYS.map((key) => ({ value: key, label: DATA_REQUEST_STATUS_LABELS[key]?.label ?? key }))]}
            />
          </Field>
          <Field id="dr-type" label="Type">
            <Select
              {...fieldControlProps("dr-type")}
              name="type"
              defaultValue={type ?? ""}
              options={[{ value: "", label: "Tous" }, ...DATA_REQUEST_TYPE_KEYS.map((key) => ({ value: key, label: DATA_REQUEST_TYPE_LABELS[key] ?? key }))]}
            />
          </Field>
        </FilterBar>
      </Card>

      {result.status === "success" && overdueCount > 0 ? (
        <StateMessage tone="warning">{overdueCount} demande{overdueCount > 1 ? "s" : ""} de cette page dépasse{overdueCount > 1 ? "nt" : ""} l&apos;échéance indicative.</StateMessage>
      ) : null}

      <Card title="File des demandes" description="Cliquez sur une référence pour ouvrir le détail, prendre en charge ou clôturer la demande.">
        <Stack>
          <DataTable
            columns={columns}
            items={items}
            getKey={(item) => item.id}
            emptyLabel="Aucune demande de données pour ces filtres."
            aria-label="Demandes de données des visiteurs"
          />
          {nextCursor ? (
            <div>
              <Button
                href={`/compliance/data-requests${toQueryString({ status, type, cursor: nextCursor })}`}
                variant="secondary"
                size="sm"
              >
                Page suivante
              </Button>
            </div>
          ) : null}
        </Stack>
      </Card>
    </PageStack>
  );
}
