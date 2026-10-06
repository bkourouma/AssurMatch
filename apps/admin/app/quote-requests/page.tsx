import { firstValue, formatDateTime, pageHref, pageNumber, readQuoteRequests, type QuoteRequestRow } from "../lib/operations-api";
import { Badge, Card, DataTable, Field, FilterBar, Input, PageHeader, PageStack, Select, StateMessage, fieldControlProps, type DataTableColumn } from "../lib/ui/admin-ui";
import { quoteStatusTones } from "../lib/ui/operations-tones";
import { OperationsTabs } from "../lib/ui/operations-tabs";

/**
 * Spec 056 (H-01): quote requests console. Rows carry routing facts only; the record (consent,
 * routing decisions, assignments, documents) opens on the detail page. Scope and masking are
 * enforced by the API.
 */

const statusOptions = ["created", "manual_review", "routed", "non_routable", "duplicate", "spam_blocked", "cancelled"];
const routingStatusOptions = ["not_started", "assigned", "blocked", "no_broker_available", "manual_review_required", "pending_manual_assignment"];

const columns: Array<DataTableColumn<QuoteRequestRow>> = [
  { key: "reference", header: "Reference", render: (row) => <code>{row.publicReference}</code> },
  { key: "scope", header: "Pays / produit", render: (row) => `${row.countryCode ?? row.countryId.slice(0, 8)} / ${row.productKey ?? row.productId.slice(0, 8)}` },
  { key: "status", header: "Statut", render: (row) => <Badge tone={quoteStatusTones[row.status] ?? "neutral"}>{row.status}</Badge> },
  { key: "routing", header: "Routage", render: (row) => row.routingStatus },
  { key: "assignments", header: "Affectations", render: (row) => row.assignmentCount, numeric: true, align: "right" },
  { key: "reason", header: "Motif", render: (row) => row.refusalReason ?? "-" },
  { key: "created", header: "Recue le", render: (row) => formatDateTime(row.createdAt) }
];

export default async function AdminQuoteRequestsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {};
  const filters = {
    status: firstValue(params.status),
    routingStatus: firstValue(params.routingStatus),
    countryId: firstValue(params.countryId),
    productId: firstValue(params.productId),
    reference: firstValue(params.reference),
    from: firstValue(params.from),
    to: firstValue(params.to)
  };
  const page = pageNumber(params.page);
  const result = await readQuoteRequests({ ...filters, page, pageSize: 50 });
  const activeFilters = Object.values(filters).filter(Boolean).length;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Operations", href: "/operations" }, { label: "Demandes de devis" }]}
        kicker="Operations"
        title="Demandes de devis"
        description="Suivi des demandes, consentements, doublons, routage et notifications avec acces RBAC. Les demandes sont limitees a votre perimetre pays; les coordonnees restent dans la fiche."
      />
      <OperationsTabs current="/quote-requests" />

      {result.status === "unauthenticated" ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {result.status === "forbidden" ? <StateMessage tone="danger">Acces aux demandes de devis refuse pour ce role admin.</StateMessage> : null}
      {result.status === "error" ? <StateMessage tone="danger">Demandes indisponibles : {result.error}</StateMessage> : null}

      <Card>
        <FilterBar action="/quote-requests" label="Filtres demandes de devis" submitLabel="Filtrer" resetLabel="Reinitialiser" resetHref="/quote-requests" activeCount={activeFilters}>
          <Field id="qr-status" label="Statut">
            <Select {...fieldControlProps("qr-status")} name="status" defaultValue={filters.status ?? ""}>
              <option value="">Tous</option>
              {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
          </Field>
          <Field id="qr-routing" label="Statut de routage">
            <Select {...fieldControlProps("qr-routing")} name="routingStatus" defaultValue={filters.routingStatus ?? ""}>
              <option value="">Tous</option>
              {routingStatusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
          </Field>
          <Field id="qr-country" label="Pays (UUID)">
            <Input {...fieldControlProps("qr-country")} name="countryId" defaultValue={filters.countryId ?? ""} />
          </Field>
          <Field id="qr-product" label="Produit (UUID)">
            <Input {...fieldControlProps("qr-product")} name="productId" defaultValue={filters.productId ?? ""} />
          </Field>
          <Field id="qr-reference" label="Reference">
            <Input {...fieldControlProps("qr-reference")} name="reference" defaultValue={filters.reference ?? ""} placeholder="QR-2026-" />
          </Field>
          <Field id="qr-from" label="Du">
            <Input {...fieldControlProps("qr-from")} name="from" type="date" defaultValue={filters.from ?? ""} />
          </Field>
          <Field id="qr-to" label="Au">
            <Input {...fieldControlProps("qr-to")} name="to" type="date" defaultValue={filters.to ?? ""} />
          </Field>
        </FilterBar>
      </Card>

      <Card as="section" aria-label="Liste des demandes de devis">
        <DataTable
          columns={columns}
          items={result.data.items}
          getKey={(row) => row.id}
          getRowHref={(row) => `/quote-requests/${row.id}`}
          emptyLabel="Aucune demande de devis pour ces filtres."
          aria-label="Demandes de devis"
          pagination={{
            page,
            pageSize: result.data.pageSize,
            total: result.data.total,
            hrefFor: (target) => pageHref("/quote-requests", filters, target),
            label: (from, to, total) => `${from}-${to} sur ${total} demandes`
          }}
        />
      </Card>
    </PageStack>
  );
}
