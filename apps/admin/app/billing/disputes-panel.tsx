import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  DescriptionList,
  Field,
  FilterBar,
  Input,
  RadioGroup,
  Select,
  StateMessage,
  Textarea,
  fieldControlProps
} from "../lib/ui/admin-ui";
import type { DataTableColumn } from "../lib/ui/admin-ui";
import { decideLeadDisputeAction } from "../lib/billing-actions";
import {
  DISPUTE_CREDIT_MODE_LABELS,
  DISPUTE_DECISION_OPTIONS,
  DISPUTE_REJECTION_FINAL_NOTICE,
  DISPUTE_REASON_MAX_LENGTH,
  DISPUTE_REASON_MIN_LENGTH,
  DISPUTE_SOURCE_LABELS,
  DISPUTE_STATUS_FILTER_OPTIONS,
  DISPUTE_STATUS_LABELS,
  DISPUTE_STATUS_TONES,
  disputeReasonLabel
} from "../lib/dispute-vocabulary";
import type { AdminApiState, AdminLeadDispute, AdminLeadDisputeList } from "../lib/admin-api";
import { productLabel } from "../lib/ui/operations-labels";

/** Filters of the disputes tab, as typed in the query string (dates are `YYYY-MM-DD`). */
export interface DisputeTabFilters {
  status: string;
  partnerId: string;
  countryCode: string;
  from: string;
  to: string;
}

function xof(amount: number): string {
  return `${amount.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} XOF`;
}

function day(value: string | undefined): string {
  return value ? value.slice(0, 10) : "-";
}

/** Query string of the tab: the filters survive a click on a row, a page or the back link. */
export function disputesHref(filters: DisputeTabFilters, extra: { page?: number; dispute?: string } = {}): string {
  const query = new URLSearchParams({ tab: "contestations" });
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  if (extra.page && extra.page > 1) query.set("page", String(extra.page));
  if (extra.dispute) query.set("dispute", extra.dispute);
  return `/billing?${query.toString()}`;
}

function creditSummary(dispute: AdminLeadDispute): string {
  if (dispute.status !== "accepted") return "-";
  // Typed as a plain string so that a mode added to the contract (pack_credit) never breaks the screen.
  const mode: string | undefined = dispute.creditMode;
  if (mode === "pack_credit") return DISPUTE_CREDIT_MODE_LABELS.pack_credit ?? "-";
  if (dispute.creditMode === "credit_note") {
    return `Avoir ${dispute.creditNoteNumber ?? ""}${dispute.creditAmount !== undefined ? ` - ${xof(dispute.creditAmount)} TTC` : ""}`.trim();
  }
  if (dispute.creditMode === "draft_invoice") return DISPUTE_CREDIT_MODE_LABELS.draft_invoice ?? "-";
  if (dispute.creditMode === "none") return "Traitement manuel";
  return "-";
}

function disputeColumns(filters: DisputeTabFilters): Array<DataTableColumn<AdminLeadDispute>> {
  return [
    {
      key: "reference",
      header: "Référence du lead",
      render: (dispute) => (
        <a href={disputesHref(filters, { dispute: dispute.id })}>
          <code>{dispute.publicReference ?? dispute.leadAssignmentId}</code>
        </a>
      )
    },
    { key: "partner", header: "Cabinet", render: (dispute) => <strong>{dispute.partnerName ?? dispute.partnerTenantId}</strong> },
    { key: "country", header: "Pays", render: (dispute) => dispute.countryCode ?? "-" },
    { key: "reason", header: "Motif", render: (dispute) => disputeReasonLabel(dispute.reason) },
    {
      key: "status",
      header: "Statut",
      render: (dispute) => <Badge tone={DISPUTE_STATUS_TONES[dispute.status] ?? "neutral"}>{DISPUTE_STATUS_LABELS[dispute.status] ?? dispute.status}</Badge>
    },
    { key: "createdAt", header: "Déposée le", render: (dispute) => day(dispute.createdAt) },
    { key: "decision", header: "Décision", render: (dispute) => (dispute.decidedAt ? day(dispute.decidedAt) : "En attente") },
    { key: "credit", header: "Crédit", render: (dispute) => creditSummary(dispute) }
  ];
}

export interface DisputesPanelProps {
  filters: DisputeTabFilters;
  list: AdminApiState<AdminLeadDisputeList>;
  detail: AdminApiState<AdminLeadDispute | null> | undefined;
  partners: Array<{ partnerId: string; partnerName: string }>;
  canDecide: boolean;
  page: number;
}

/**
 * Spec 063 FR-B10: disputes tab of the billing page. Only dispute data is rendered: never the
 * contact or the answers of the lead. The decision form is offered for an opened dispute and only to
 * the roles holding `billing:dispute_decide` (the API re-checks the role and the country scope).
 */
export function DisputesPanel({ filters, list, detail, partners, canDecide, page }: DisputesPanelProps) {
  const activeCount = Object.values(filters).filter(Boolean).length;
  const items = list.status === "success" ? list.data.items : [];
  const total = list.status === "success" ? list.data.total : 0;
  const pageSize = list.status === "success" ? list.data.pageSize : 20;

  return (
    <>
      <Card
        title="Contestations de leads"
        description="Un cabinet peut contester un lead dans les 30 jours suivant sa réception. La finance accepte (crédit sur le prochain brouillon ou avoir partiel) ou rejette, avec un motif obligatoire. Aucune prime d'assurance n'est concernée."
      >
        <FilterBar action="/billing" label="Filtres des contestations" submitLabel="Filtrer" resetLabel="Réinitialiser" resetHref="/billing?tab=contestations" activeCount={activeCount}>
          <input type="hidden" name="tab" value="contestations" />
          <Field id="dispute-filter-status" label="Statut">
            <Select {...fieldControlProps("dispute-filter-status")} name="status" defaultValue={filters.status} placeholder="Tous les statuts" options={DISPUTE_STATUS_FILTER_OPTIONS} />
          </Field>
          <Field id="dispute-filter-partner" label="Cabinet">
            <Select
              {...fieldControlProps("dispute-filter-partner")}
              name="partnerId"
              defaultValue={filters.partnerId}
              placeholder="Tous les cabinets"
              options={partners.map((partner) => ({ value: partner.partnerId, label: partner.partnerName }))}
            />
          </Field>
          <Field id="dispute-filter-country" label="Pays (ISO)">
            <Input {...fieldControlProps("dispute-filter-country")} name="countryCode" maxLength={2} defaultValue={filters.countryCode} placeholder="CI" />
          </Field>
          <Field id="dispute-filter-from" label="Du">
            <Input {...fieldControlProps("dispute-filter-from")} name="from" type="date" defaultValue={filters.from} />
          </Field>
          <Field id="dispute-filter-to" label="Au">
            <Input {...fieldControlProps("dispute-filter-to")} name="to" type="date" defaultValue={filters.to} />
          </Field>
        </FilterBar>

        {list.status === "forbidden" ? <StateMessage tone="danger">Les contestations ne sont pas accessibles pour ce rôle admin.</StateMessage> : null}
        {list.status === "error" ? <StateMessage tone="danger">Contestations indisponibles ({list.error}).</StateMessage> : null}

        <DataTable
          columns={disputeColumns(filters)}
          items={items}
          getKey={(dispute) => dispute.id}
          emptyLabel="Aucune contestation pour ces filtres."
          aria-label="Contestations de leads"
          pagination={{
            page,
            pageSize,
            total,
            hrefFor: (target) => disputesHref(filters, { page: target }),
            label: (from, to, count) => `${from}-${to} sur ${count} contestations`
          }}
        />
      </Card>

      {detail ? <DisputeDetail detail={detail} canDecide={canDecide} backHref={disputesHref(filters, { page })} /> : null}
    </>
  );
}

const REASON_HINT = `Entre ${DISPUTE_REASON_MIN_LENGTH} et ${DISPUTE_REASON_MAX_LENGTH} caractères. Il est conservé dans le journal d'audit et communiqué au cabinet.`;

function DisputeDetail({ detail, canDecide, backHref }: { detail: AdminApiState<AdminLeadDispute | null>; canDecide: boolean; backHref: string }) {
  if (detail.status === "forbidden") {
    return <StateMessage tone="danger">Cette contestation n'est pas accessible pour ce rôle admin ou ce périmètre pays.</StateMessage>;
  }
  if (detail.status !== "success" || !detail.data) {
    return <StateMessage tone="warning">Contestation introuvable ou indisponible ({detail.error ?? "api_404"}).</StateMessage>;
  }
  const dispute = detail.data;
  const decided = dispute.status !== "opened";

  return (
    <Card
      title={`Contestation du lead ${dispute.publicReference ?? dispute.leadAssignmentId}`}
      description="Données de la contestation uniquement : les coordonnées et les réponses du visiteur ne sont jamais affichées ici."
    >
      <DescriptionList
        columns={2}
        items={[
          { term: "Référence du lead", value: <code>{dispute.publicReference ?? dispute.leadAssignmentId}</code> },
          { term: "Cabinet", value: dispute.partnerName ?? dispute.partnerTenantId },
          { term: "Pays / produit", value: `${dispute.countryCode ?? "-"} / ${productLabel(dispute.productKey)}` },
          { term: "Origine", value: DISPUTE_SOURCE_LABELS[dispute.source] ?? dispute.source },
          { term: "Lead reçu le", value: day(dispute.assignedAt) },
          { term: "Contestation déposée le", value: day(dispute.createdAt) },
          { term: "Motif du cabinet", value: disputeReasonLabel(dispute.reason) },
          { term: "Commentaire du cabinet", value: dispute.comment || "-" },
          { term: "Statut", value: <Badge tone={DISPUTE_STATUS_TONES[dispute.status] ?? "neutral"}>{DISPUTE_STATUS_LABELS[dispute.status] ?? dispute.status}</Badge> },
          ...(decided
            ? [
                { term: "Décidée le", value: day(dispute.decidedAt) },
                { term: "Motif de la décision", value: dispute.decisionReason || "-" }
              ]
            : [])
        ]}
      />

      {dispute.status === "accepted" ? <CreditOutcome dispute={dispute} /> : null}
      {dispute.status === "rejected" ? <StateMessage tone="info">Contestation rejetée : le lead reste facturable, aucun crédit. {DISPUTE_REJECTION_FINAL_NOTICE}</StateMessage> : null}

      {!decided && canDecide ? (
        <ConfirmDialog
          triggerLabel="Statuer sur la contestation"
          triggerVariant="primary"
          title="Statuer sur la contestation"
          description="La décision est définitive et auditée. Le motif est obligatoire et le cabinet en est notifié. Accepter crédite le lead sur le prochain brouillon ou par un avoir partiel."
          confirmLabel="Enregistrer la décision"
          cancelLabel="Annuler"
          formAction={decideLeadDisputeAction}
          dataAttributes={{ "data-dispute-decision-form": "true" }}
        >
          <input type="hidden" name="disputeId" value={dispute.id} />
          <RadioGroup legend="Décision" name="decision" options={DISPUTE_DECISION_OPTIONS} columns={1} />
          <Field id="dispute-decision-reason" label="Motif de la décision" required requiredLabel="obligatoire" hint={REASON_HINT}>
            <Textarea
              {...fieldControlProps("dispute-decision-reason", { required: true, hint: REASON_HINT })}
              name="reason"
              rows={4}
              required
              minLength={DISPUTE_REASON_MIN_LENGTH}
              maxLength={DISPUTE_REASON_MAX_LENGTH}
              aria-label="Motif de la décision"
            />
          </Field>
        </ConfirmDialog>
      ) : null}
      {!decided && !canDecide ? <StateMessage tone="info">La décision est réservée au Finance Admin et au Super Admin.</StateMessage> : null}

      <p>
        <Button href={backHref} variant="tertiary" size="sm">Retour à la liste des contestations</Button>
      </p>
    </Card>
  );
}

/** Spec 063 FR-B06: how an accepted dispute was credited. */
function CreditOutcome({ dispute }: { dispute: AdminLeadDispute }) {
  const mode: string | undefined = dispute.creditMode;
  if (mode === "pack_credit") return <StateMessage tone="success">{DISPUTE_CREDIT_MODE_LABELS.pack_credit}.</StateMessage>;
  if (dispute.creditMode === "credit_note") {
    return (
      <StateMessage tone="success">
        Avoir partiel {dispute.creditNoteNumber ?? ""} émis{dispute.creditAmount !== undefined ? ` pour ${xof(dispute.creditAmount)} TTC` : ""}.{" "}
        {dispute.creditNoteId ? <a href={`/billing/credit-notes/${dispute.creditNoteId}/pdf`}>Télécharger le PDF de l'avoir</a> : null}
      </StateMessage>
    );
  }
  if (dispute.creditMode === "draft_invoice") return <StateMessage tone="success">{DISPUTE_CREDIT_MODE_LABELS.draft_invoice}.</StateMessage>;
  return <StateMessage tone="warning">{DISPUTE_CREDIT_MODE_LABELS.none}.</StateMessage>;
}
