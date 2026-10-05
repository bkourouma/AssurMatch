import { firstValue, formatDateTime, pageHref, pageNumber, readRoutingHistory, type RoutingHistoryRow } from "../../lib/operations-api";
import { Badge, Button, Card, DataTable, Field, FilterBar, Input, PageHeader, PageStack, Select, StateMessage, fieldControlProps, type DataTableColumn } from "../../lib/ui/admin-ui";
import { routingResultTones } from "../../lib/ui/operations-tones";

/**
 * Spec 056 (H-06): history of routing decisions, refusals included (principle VII): candidates,
 * partners retained, excluded candidates with their reasons. Scoped to the admin's countries.
 * Rule changes keep their own history (`GET /admin/routing-rules/:id/history`, routing page).
 */

const columns: Array<DataTableColumn<RoutingHistoryRow>> = [
  { key: "date", header: "Date", render: (row) => formatDateTime(row.createdAt) },
  { key: "request", header: "Demande", render: (row) => <a href={`/quote-requests/${row.quoteRequestId}`}><code>{row.publicReference ?? row.quoteRequestId.slice(0, 8)}</code></a> },
  { key: "scope", header: "Pays / produit", render: (row) => `${row.countryCode ?? "-"} / ${row.productKey ?? "-"}` },
  { key: "result", header: "Resultat", render: (row) => <Badge tone={routingResultTones[row.result] ?? "neutral"}>{row.result}</Badge> },
  { key: "candidates", header: "Candidats", render: (row) => row.candidateCount, numeric: true, align: "right" },
  { key: "selected", header: "Retenus", render: (row) => row.selectedPartners.map((partner) => partner.legalName ?? partner.partnerTenantId.slice(0, 8)).join(", ") || "-" },
  {
    key: "excluded",
    header: "Exclus et raisons",
    render: (row) => row.excludedCandidates.length === 0
      ? "-"
      : row.excludedCandidates.map((candidate) => `${candidate.legalName ?? candidate.partnerTenantId.slice(0, 8)} : ${candidate.reasons.join(", ")}`).join(" ; ")
  },
  { key: "reasons", header: "Raisons", render: (row) => row.reasons.join(", ") || "-" }
];

export default async function RoutingHistoryPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {};
  const filters = { result: firstValue(params.result), countryId: firstValue(params.countryId), from: firstValue(params.from), to: firstValue(params.to) };
  const page = pageNumber(params.page);
  const result = await readRoutingHistory({ ...filters, page, pageSize: 50 });

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue" }, { label: "Routage", href: "/routing" }, { label: "Historique" }]}
        kicker="Routage des leads"
        title="Historique de routage"
        description="Decisions de routage journalisees, y compris les refus : courtiers partenaires retenus, candidats exclus et raisons."
        actions={<Button href="/routing/anomalies" variant="secondary">Anomalies de routage</Button>}
      />

      {result.status === "unauthenticated" ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {result.status === "forbidden" ? <StateMessage tone="danger">Historique de routage non accessible pour ce role admin.</StateMessage> : null}
      {result.status === "error" ? <StateMessage tone="danger">Historique indisponible : {result.error}</StateMessage> : null}

      <Card>
        <FilterBar action="/routing/history" label="Filtres historique de routage" submitLabel="Filtrer" resetLabel="Reinitialiser" resetHref="/routing/history" activeCount={Object.values(filters).filter(Boolean).length}>
          <Field id="rh-result" label="Resultat">
            <Select {...fieldControlProps("rh-result")} name="result" defaultValue={filters.result ?? ""}>
              <option value="">Tous</option>
              <option value="assigned">assigned</option>
              <option value="blocked">blocked</option>
              <option value="no_broker_available">no_broker_available</option>
              <option value="pending_manual_assignment">pending_manual_assignment</option>
            </Select>
          </Field>
          <Field id="rh-country" label="Pays (UUID)">
            <Input {...fieldControlProps("rh-country")} name="countryId" defaultValue={filters.countryId ?? ""} />
          </Field>
          <Field id="rh-from" label="Du">
            <Input {...fieldControlProps("rh-from")} name="from" type="date" defaultValue={filters.from ?? ""} />
          </Field>
          <Field id="rh-to" label="Au">
            <Input {...fieldControlProps("rh-to")} name="to" type="date" defaultValue={filters.to ?? ""} />
          </Field>
        </FilterBar>
      </Card>

      <Card as="section" aria-label="Decisions de routage">
        <DataTable
          columns={columns}
          items={result.data.items}
          getKey={(row) => row.id}
          emptyLabel="Aucune decision de routage pour ces filtres."
          aria-label="Historique des decisions de routage"
          pagination={{
            page,
            pageSize: result.data.pageSize,
            total: result.data.total,
            hrefFor: (target) => pageHref("/routing/history", filters, target),
            label: (from, to, total) => `${from}-${to} sur ${total} decisions`
          }}
        />
      </Card>
    </PageStack>
  );
}
