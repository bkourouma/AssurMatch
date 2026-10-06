import { firstValue, formatDateTime, pageHref, pageNumber, readLeadAssignments, type LeadAssignmentRow } from "../lib/operations-api";
import { Badge, Card, DataTable, Field, FilterBar, Input, PageHeader, PageStack, Select, StateMessage, fieldControlProps, type DataTableColumn } from "../lib/ui/admin-ui";
import { ReassignAssignmentForm } from "../lib/ui/operations-forms";
import { OperationsTabs } from "../lib/ui/operations-tabs";
import { assignmentStatusTones } from "../lib/ui/operations-tones";

/**
 * Spec 056 (H-03): lead assignments with the partner's name and status, never the visitor's contact
 * or answers. Reassignment goes through the existing service: the new partner must be eligible, the
 * former one loses access and the change is audited.
 */

const statusOptions = ["assigned", "broker_notified", "seen", "accepted", "received", "contacted", "rejected", "closed", "disputed"];

const columns: Array<DataTableColumn<LeadAssignmentRow>> = [
  { key: "reference", header: "Demande", render: (row) => <a href={`/quote-requests/${row.quoteRequestId}`}><code>{row.publicReference ?? row.quoteRequestId.slice(0, 8)}</code></a> },
  { key: "scope", header: "Pays / produit", render: (row) => `${row.countryCode ?? "-"} / ${row.productKey ?? "-"}` },
  { key: "partner", header: "Courtier partenaire", render: (row) => row.partnerLegalName ?? row.partnerTenantId.slice(0, 8) },
  { key: "status", header: "Statut", render: (row) => <Badge tone={assignmentStatusTones[row.status] ?? "neutral"}>{row.status}</Badge> },
  { key: "recipients", header: "Destinataires", render: (row) => row.recipientCount, numeric: true, align: "right" },
  { key: "assigned", header: "Affecte le", render: (row) => formatDateTime(row.assignedAt) },
  { key: "action", header: "Derniere action courtier", render: (row) => formatDateTime(row.lastBrokerActionAt) }
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

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Operations", href: "/operations" }, { label: "Assignations" }]}
        kicker="Operations"
        title="Routage des leads"
        description="Resultats de routage, courtier assigne, exclusions et raisons auditees. Les coordonnees du visiteur ne sont jamais listees ici."
      />
      <OperationsTabs current="/lead-assignments" />

      {result.status === "unauthenticated" ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {result.status === "forbidden" ? <StateMessage tone="danger">Acces aux affectations refuse pour ce role admin.</StateMessage> : null}
      {result.status === "error" ? <StateMessage tone="danger">Affectations indisponibles : {result.error}</StateMessage> : null}

      <Card>
        <FilterBar action="/lead-assignments" label="Filtres affectations" submitLabel="Filtrer" resetLabel="Reinitialiser" resetHref="/lead-assignments" activeCount={Object.values(filters).filter(Boolean).length}>
          <Field id="la-status" label="Statut">
            <Select {...fieldControlProps("la-status")} name="status" defaultValue={filters.status ?? ""}>
              <option value="">Tous</option>
              {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
          </Field>
          <Field id="la-country" label="Pays (code ISO)">
            <Input {...fieldControlProps("la-country")} name="countryCode" defaultValue={filters.countryCode ?? ""} maxLength={3} />
          </Field>
          <Field id="la-product" label="Produit (cle)">
            <Input {...fieldControlProps("la-product")} name="productKey" defaultValue={filters.productKey ?? ""} />
          </Field>
          <Field id="la-partner" label="Courtier partenaire (UUID)">
            <Input {...fieldControlProps("la-partner")} name="partnerTenantId" defaultValue={filters.partnerTenantId ?? ""} />
          </Field>
          <Field id="la-from" label="Du">
            <Input {...fieldControlProps("la-from")} name="from" type="date" defaultValue={filters.from ?? ""} />
          </Field>
          <Field id="la-to" label="Au">
            <Input {...fieldControlProps("la-to")} name="to" type="date" defaultValue={filters.to ?? ""} />
          </Field>
        </FilterBar>
      </Card>

      <Card as="section" aria-label="Liste des affectations">
        <DataTable
          columns={columns}
          items={result.data.items}
          getKey={(row) => row.id}
          emptyLabel="Aucune affectation pour ces filtres."
          aria-label="Affectations de leads"
          rowActions={(row) => (
            <details>
              <summary>Reaffecter</summary>
              <ReassignAssignmentForm assignmentId={row.id} partners={partners.filter((partner) => partner.id !== row.partnerTenantId)} />
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
      </Card>
    </PageStack>
  );
}
