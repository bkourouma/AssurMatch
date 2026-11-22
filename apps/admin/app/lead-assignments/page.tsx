import { firstValue, formatDateTime, pageHref, pageNumber, readLeadAssignments, type LeadAssignmentRow } from "../lib/operations-api";
import { Badge, DataTable, Field, FilterBar, Input, PageHeader, PageStack, Select, StateMessage, fieldControlProps, type DataTableColumn } from "../lib/ui/admin-ui";
import { ReassignAssignmentForm } from "../lib/ui/operations-forms";
import { OperationsTabs } from "../lib/ui/operations-tabs";
import { assignmentStatusTones } from "../lib/ui/operations-tones";
import { assignmentStatusLabel, productLabel, PRODUCT_LABELS } from "../lib/ui/operations-labels";
import { ActiveFilters, type ActiveFilterChip } from "../lib/ui/active-filters";
import { readFailureDetail } from "../lib/auth-error-messages";

/**
 * Spec 056 (H-03): lead assignments with the partner's name and status, never the visitor's contact
 * or answers. Reassignment goes through the existing service: the new partner must be eligible, the
 * former one loses access and the change is audited.
 */

const statusOptions = ["assigned", "broker_notified", "seen", "accepted", "received", "contacted", "rejected", "closed", "disputed"];

const columns: Array<DataTableColumn<LeadAssignmentRow>> = [
  { key: "reference", header: "Demande", render: (row) => <a className="bo-ref" href={`/quote-requests/${row.quoteRequestId}`}>{row.publicReference ?? row.quoteRequestId.slice(0, 8)}</a> },
  { key: "scope", header: "Pays / produit", render: (row) => `${row.countryCode ?? "-"} / ${productLabel(row.productKey)}` },
  { key: "partner", header: "Courtier partenaire", render: (row) => row.partnerLegalName ?? row.partnerTenantId.slice(0, 8) },
  { key: "status", header: "Statut", render: (row) => <Badge tone={assignmentStatusTones[row.status] ?? "neutral"}>{assignmentStatusLabel(row.status)}</Badge> },
  { key: "recipients", header: "Destinataires", render: (row) => row.recipientCount, numeric: true, align: "right" },
  { key: "assigned", header: "Affecté le", render: (row) => formatDateTime(row.assignedAt) },
  { key: "action", header: "Dernière action courtier", render: (row) => formatDateTime(row.lastBrokerActionAt) }
];

export default async function AdminLeadAssignmentsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {};
  const filters = {
    status: firstValue(params.status),
    countryCode: firstValue(params.countryCode),
    productKey: firstValue(params.productKey),
    partnerTenantId: firstValue(params.partnerTenantId),
    from: firstValue(params.from),
    to: firstValue(params.to)
  };
  const page = pageNumber(params.page);
  const result = await readLeadAssignments({ ...filters, page, pageSize: 50 });
  const partners = [...new Map(result.data.items.map((row) => [row.partnerTenantId, { id: row.partnerTenantId, legalName: row.partnerLegalName ?? row.partnerTenantId }])).values()];
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const partnerName = (id: string) => partners.find((partner) => partner.id === id)?.legalName ?? id.slice(0, 8);
  const productOptions = Object.keys(PRODUCT_LABELS);
  // A product key filtered through the URL but unknown to the catalogue labels stays selectable.
  if (filters.productKey && !productOptions.includes(filters.productKey)) productOptions.push(filters.productKey);
  const chips: ActiveFilterChip[] = [
    ...(filters.status ? [{ key: "status", label: "Statut", value: assignmentStatusLabel(filters.status) }] : []),
    ...(filters.countryCode ? [{ key: "countryCode", label: "Pays", value: filters.countryCode.toUpperCase() }] : []),
    ...(filters.productKey ? [{ key: "productKey", label: "Produit", value: productLabel(filters.productKey) }] : []),
    ...(filters.partnerTenantId ? [{ key: "partnerTenantId", label: "Courtier", value: partnerName(filters.partnerTenantId) }] : []),
    ...(filters.from ? [{ key: "from", label: "Du", value: filters.from }] : []),
    ...(filters.to ? [{ key: "to", label: "Au", value: filters.to }] : [])
  ];
  const invertedPeriod = Boolean(filters.from && filters.to && filters.from > filters.to);
  const partnerHint = "Identifiant du courtier, visible sur sa fiche partenaire.";

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Opérations", href: "/operations" }, { label: "Assignations" }]}
        title="Routage des leads"
        description="Courtier assigné et statut de chaque lead, avec réaffectation auditée. Les coordonnées du visiteur ne sont jamais listées ici."
        actions={result.status === "success" ? <Badge tone="neutral">{`${result.data.total} affectation(s)${activeFilters > 0 ? " filtrée(s)" : ""}`}</Badge> : null}
      />
      <OperationsTabs current="/lead-assignments" />

      {result.status === "unauthenticated" ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {result.status === "forbidden" ? <StateMessage tone="danger">Accès aux affectations refusé pour ce rôle admin.</StateMessage> : null}
      {result.status === "error" ? <StateMessage tone="danger">Affectations indisponibles. {readFailureDetail(result.error)}</StateMessage> : null}

      {invertedPeriod ? <StateMessage tone="warning">La date « Du » est postérieure à la date « Au » : aucune affectation ne peut correspondre. Corrigez la période.</StateMessage> : null}

      <FilterBar action="/lead-assignments" label="Filtres affectations" submitLabel="Filtrer" resetLabel="Réinitialiser" resetHref="/lead-assignments" activeCount={activeFilters}>
        <Field id="la-status" label="Statut">
          <Select {...fieldControlProps("la-status")} name="status" defaultValue={filters.status ?? ""}>
            <option value="">Tous</option>
            {statusOptions.map((option) => <option key={option} value={option}>{assignmentStatusLabel(option)}</option>)}
          </Select>
        </Field>
        <Field id="la-country" label="Pays (code ISO)">
          <Input {...fieldControlProps("la-country")} name="countryCode" defaultValue={filters.countryCode ?? ""} maxLength={3} />
        </Field>
        <Field id="la-product" label="Produit">
          <Select {...fieldControlProps("la-product")} name="productKey" defaultValue={filters.productKey ?? ""}>
            <option value="">Tous</option>
            {productOptions.map((option) => <option key={option} value={option}>{productLabel(option)}</option>)}
          </Select>
        </Field>
        <Field id="la-partner" label="Courtier partenaire (identifiant)" hint={partnerHint}>
          <Input {...fieldControlProps("la-partner", { hint: partnerHint })} name="partnerTenantId" defaultValue={filters.partnerTenantId ?? ""} />
        </Field>
        <Field id="la-from" label="Du">
          <Input {...fieldControlProps("la-from")} name="from" type="date" defaultValue={filters.from ?? ""} />
        </Field>
        <Field id="la-to" label="Au">
          <Input {...fieldControlProps("la-to")} name="to" type="date" defaultValue={filters.to ?? ""} />
        </Field>
      </FilterBar>
      <ActiveFilters pathname="/lead-assignments" filters={filters} chips={chips} />

      <DataTable
        columns={columns}
        items={result.data.items}
        getKey={(row) => row.id}
        emptyLabel="Aucune affectation pour ces filtres."
        emptyDescription={activeFilters > 0 ? "Élargissez la période ou réinitialisez les filtres." : "Les affectations apparaissent ici dès que le routage attribue une demande à un courtier partenaire."}
        aria-label="Affectations de leads"
        className="lead-assignments-table"
        rowActions={(row) => (
          <details className="lead-assignments-reassign">
            <summary>Réaffecter</summary>
            <ReassignAssignmentForm
              assignmentId={row.id}
              partners={partners.filter((partner) => partner.id !== row.partnerTenantId)}
              reference={row.publicReference ?? row.quoteRequestId.slice(0, 8)}
              currentPartnerName={row.partnerLegalName ?? row.partnerTenantId.slice(0, 8)}
            />
          </details>
        )}
        pagination={{
          page,
          pageSize: result.data.pageSize,
          total: result.data.total,
          hrefFor: (target) => pageHref("/lead-assignments", filters, target),
          label: (from, to, total) => `${from}-${to} sur ${total} affectations`
        }}
      />
    </PageStack>
  );
}
