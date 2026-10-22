import { Badge, Card, DataTable, Notice } from "../lib/ui/broker-ui";
import type { DataTableColumn } from "../lib/ui/broker-ui";
import { selfServiceFormatDate } from "../lib/self-service-messages";
import { readBrokerPlanChangeRequests, type PlanChangeRequest } from "./lot5-api";
import { CancelPlanChangeForm, PlanChangeRequestForm } from "./lot5-forms";
import {
  PLAN_CHANGE_NO_PAYMENT_NOTICE,
  PLAN_CHANGE_STATUS_LABELS,
  PLAN_CHANGE_STATUS_TONES,
  PLAN_LABELS,
  billingLineKindLabel
} from "./lot5-labels";

function xof(amount: number): string {
  return `${amount.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} XOF`;
}

function effectLabel(request: PlanChangeRequest): string {
  if (request.status === "accepted") return `à partir du ${selfServiceFormatDate(request.effectiveAt)} (prochain cycle)`;
  if (request.status === "pending") return "au prochain cycle mensuel, si la demande est acceptée";
  return "-";
}

const requestColumns: Array<DataTableColumn<PlanChangeRequest>> = [
  { key: "requestedAt", header: "Demandée le", render: (request) => selfServiceFormatDate(request.requestedAt) },
  { key: "change", header: "Changement", render: (request) => `${PLAN_LABELS[request.currentPlan] ?? request.currentPlan} vers ${PLAN_LABELS[request.requestedPlan] ?? request.requestedPlan}` },
  { key: "justification", header: "Justification", render: (request) => request.justification },
  {
    key: "status",
    header: "Statut",
    render: (request) => <Badge tone={PLAN_CHANGE_STATUS_TONES[request.status] ?? "neutral"}>{PLAN_CHANGE_STATUS_LABELS[request.status] ?? request.status}</Badge>
  },
  { key: "effect", header: "Date d'effet", render: (request) => effectLabel(request) },
  { key: "decisionReason", header: "Motif de la décision", render: (request) => request.decisionReason || "-" },
  { key: "cancel", header: "Action", render: (request) => (request.status === "pending" ? <CancelPlanChangeForm requestId={request.id} /> : "-") }
];

/**
 * Lot 5 (spec 071), G-06: "Changer de plan" section of the broker billing page. Rendered for the
 * cabinet owner only; the API refuses anyone else and a suspended cabinet.
 */
export async function PlanChangeSection({ currentPlan, readOnly }: { currentPlan: string | undefined; readOnly: boolean }) {
  const requests = await readBrokerPlanChangeRequests();
  const hasPending = requests.data.items.some((request) => request.status === "pending");

  return (
    <Card
      title="Changer de plan"
      description={`Plan actuel : ${currentPlan ? PLAN_LABELS[currentPlan] ?? currentPlan : "non disponible"}. Un changement accepté prend effet au premier jour du cycle mensuel suivant.`}
    >
      <Notice tone="info">{PLAN_CHANGE_NO_PAYMENT_NOTICE}</Notice>
      {requests.status === "error" ? <Notice tone="warning">Historique des demandes temporairement indisponible.</Notice> : null}
      {requests.status === "forbidden" ? <Notice tone="warning">Les demandes de changement de plan ne sont pas accessibles pour votre rôle.</Notice> : null}
      {readOnly ? <Notice tone="warning">Compte suspendu : consultation seule. Contactez AssurMatch.</Notice> : null}
      {hasPending ? <Notice tone="info">Une demande est déjà en attente : annulez-la pour en envoyer une nouvelle.</Notice> : null}
      <PlanChangeRequestForm currentPlan={currentPlan} disabled={readOnly || hasPending} />
      <DataTable
        columns={requestColumns}
        items={requests.data.items}
        getKey={(request) => request.id}
        emptyLabel="Aucune demande de changement de plan."
        aria-label="Historique des demandes de changement de plan"
      />
    </Card>
  );
}

interface InvoiceWithLines {
  number: string;
  lines?: Array<{ kind: string; label: string; quantity: number; unitAmount: number; amount: number }> | undefined;
}

/** Invoice lines, with `setup_fee` and `add_on` worded for the broker. Hidden while the API sends no lines. */
export function InvoiceLinesSection({ invoices }: { invoices: InvoiceWithLines[] }) {
  type Row = { key: string; number: string; kind: string; label: string; quantity: number; unitAmount: number; amount: number };
  const rows: Row[] = invoices.flatMap((invoice) =>
    (invoice.lines ?? []).map((line, index) => ({ ...line, key: `${invoice.number}-${index}`, number: invoice.number }))
  );
  if (rows.length === 0) return null;
  const columns: Array<DataTableColumn<Row>> = [
    { key: "number", header: "Facture", render: (row) => <code>{row.number}</code> },
    { key: "kind", header: "Nature", render: (row) => billingLineKindLabel(row.kind) },
    { key: "label", header: "Libellé", render: (row) => row.label },
    { key: "quantity", header: "Quantité", render: (row) => row.quantity, numeric: true, align: "right" },
    { key: "unit", header: "Prix unitaire", render: (row) => xof(row.unitAmount), numeric: true, align: "right" },
    { key: "amount", header: "Montant", render: (row) => xof(row.amount), numeric: true, align: "right" }
  ];
  return (
    <Card title="Lignes des factures" description="Les frais d'installation ne sont facturés qu'une seule fois, sur la première facture ; un module complémentaire est facturé chaque mois.">
      <DataTable columns={columns} items={rows} getKey={(row) => row.key} emptyLabel="Aucune ligne." aria-label="Lignes des factures du cabinet" />
    </Card>
  );
}
