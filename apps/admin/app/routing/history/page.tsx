import { readAdminCountries } from "../../lib/admin-api";
import { firstValue, formatDateTime, pageHref, pageNumber, readRoutingHistory, type RoutingHistoryRow } from "../../lib/operations-api";
import { Badge, Button, DataTable, Field, FilterBar, Input, PageHeader, PageStack, Select, StateMessage, fieldControlProps, type DataTableColumn } from "../../lib/ui/admin-ui";
import { ActiveFilters, type ActiveFilterChip } from "../../lib/ui/active-filters";
import { candidateReasonLabel } from "../routing-labels";
import { routingResultTones } from "../../lib/ui/operations-tones";
import { readFailureDetail } from "../../lib/auth-error-messages";

/**
 * Spec 056 (H-06): history of routing decisions, refusals included (principle VII): candidates,
 * partners retained, excluded candidates with their reasons. Scoped to the admin's countries.
 * Rule changes keep their own history (`GET /admin/routing-rules/:id/history`, routing page).
 */

/** Wording of the filter only: the table keeps the raw result, which is what the API and the audit log carry. */
const RESULT_FILTER_LABELS: Record<string, string> = {
  assigned: "Assignée",
  blocked: "Bloquée",
  no_broker_available: "Aucun courtier disponible",
  pending_manual_assignment: "En attente d'assignation manuelle"
};

const columns: Array<DataTableColumn<RoutingHistoryRow>> = [
  { key: "date", header: "Date", render: (row) => formatDateTime(row.createdAt) },
  { key: "request", header: "Demande", render: (row) => <a href={`/quote-requests/${row.quoteRequestId}`}><span className="bo-ref">{row.publicReference ?? row.quoteRequestId.slice(0, 8)}</span></a> },
  { key: "scope", header: "Pays / produit", render: (row) => `${row.countryCode ?? "-"} / ${row.productKey ?? "-"}` },
  { key: "result", header: "Résultat", render: (row) => <Badge tone={routingResultTones[row.result] ?? "neutral"}>{row.result}</Badge> },
  { key: "candidates", header: "Candidats", render: (row) => row.candidateCount, numeric: true, align: "right" },
  { key: "selected", header: "Retenus", render: (row) => row.selectedPartners.map((partner) => partner.legalName ?? partner.partnerTenantId.slice(0, 8)).join(", ") || "-" },
  {
    key: "excluded",
    header: "Exclus et raisons",
    render: (row) => row.excludedCandidates.length === 0
      ? "-"
      : row.excludedCandidates.map((candidate) => `${candidate.legalName ?? candidate.partnerTenantId.slice(0, 8)} : ${candidate.reasons.map(candidateReasonLabel).join(", ")}`).join(" ; ")
  },
  { key: "reasons", header: "Raisons", render: (row) => row.reasons.join(", ") || "-" }
];

export default async function RoutingHistoryPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {};
  const filters = { result: firstValue(params.result), countryId: firstValue(params.countryId), from: firstValue(params.from), to: firstValue(params.to) };
  const page = pageNumber(params.page);
  const [result, countries] = await Promise.all([readRoutingHistory({ ...filters, page, pageSize: 50 }), readAdminCountries()]);
  const countryList = countries.status === "success" ? countries.data : [];
  const countryLabel = (id: string) => {
    const country = countryList.find((candidate) => candidate.id === id);
    return country ? `${country.isoCode} - ${country.name}` : id;
  };
  const chips: ActiveFilterChip[] = [
    ...(filters.result ? [{ key: "result", label: "Résultat", value: RESULT_FILTER_LABELS[filters.result] ?? filters.result }] : []),
    ...(filters.countryId ? [{ key: "countryId", label: "Pays", value: countryLabel(filters.countryId) }] : []),
    ...(filters.from ? [{ key: "from", label: "Du", value: filters.from }] : []),
    ...(filters.to ? [{ key: "to", label: "Au", value: filters.to }] : [])
  ];

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue" }, { label: "Routage", href: "/routing" }, { label: "Historique" }]}
        title="Historique de routage"
        description="Décisions de routage journalisées, y compris les refus : courtiers partenaires retenus, candidats exclus et raisons. Les plus récentes sont en premier ; ouvrez une demande pour voir son détail."
        actions={<Button href="/routing/anomalies" variant="secondary">Anomalies de routage</Button>}
      />

      {result.status === "unauthenticated" ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {result.status === "forbidden" ? <StateMessage tone="danger">Historique de routage non accessible pour ce rôle admin.</StateMessage> : null}
      {result.status === "error" ? <StateMessage tone="danger">Historique indisponible. {readFailureDetail(result.error)}</StateMessage> : null}

      <FilterBar action="/routing/history" label="Filtres historique de routage" submitLabel="Filtrer" resetLabel="Réinitialiser" resetHref="/routing/history" activeCount={chips.length}>
        <Field id="rh-result" label="Résultat">
          <Select {...fieldControlProps("rh-result")} name="result" defaultValue={filters.result ?? ""}>
            <option value="">Tous</option>
            {Object.entries(RESULT_FILTER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{`${label} (${value})`}</option>
            ))}
          </Select>
        </Field>
        {countryList.length > 0 ? (
          <Field id="rh-country" label="Pays">
            <Select {...fieldControlProps("rh-country")} name="countryId" defaultValue={filters.countryId ?? ""}>
              <option value="">Tous</option>
              {countryList.map((country) => <option key={country.id} value={country.id}>{`${country.isoCode} - ${country.name}`}</option>)}
            </Select>
          </Field>
        ) : (
          <Field id="rh-country" label="Pays (UUID)">
            <Input {...fieldControlProps("rh-country")} name="countryId" defaultValue={filters.countryId ?? ""} />
          </Field>
        )}
        <Field id="rh-from" label="Du">
          <Input {...fieldControlProps("rh-from")} name="from" type="date" defaultValue={filters.from ?? ""} />
        </Field>
        <Field id="rh-to" label="Au">
          <Input {...fieldControlProps("rh-to")} name="to" type="date" defaultValue={filters.to ?? ""} />
        </Field>
      </FilterBar>

      <ActiveFilters pathname="/routing/history" filters={filters} chips={chips} />

      <DataTable
        columns={columns}
        dense
        items={result.data.items}
        getKey={(row) => row.id}
        emptyLabel="Aucune décision de routage pour ces filtres."
        emptyDescription="Élargissez la période ou réinitialisez les filtres."
        aria-label="Historique des décisions de routage"
        pagination={{
          page,
          pageSize: result.data.pageSize,
          total: result.data.total,
          hrefFor: (target) => pageHref("/routing/history", filters, target),
          label: (from, to, total) => `${from}-${to} sur ${total} décisions`
        }}
      />
    </PageStack>
  );
}
