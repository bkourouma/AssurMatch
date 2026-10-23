import { redirect } from "next/navigation";
import { isBrokerProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readBrokerBillingAccount, readBrokerBillingStatement, readBrokerDisputes, type BrokerInvoiceData } from "../lib/broker-api";
import { canReadBrokerBilling, isBrokerOwner, isTenantReadOnly } from "../lib/broker-permissions";
import { InvoiceLinesSection, PlanChangeSection } from "./lot5-panels";
import { DISPUTE_CREDIT_MODE_LABELS, disputeReasonLabel, disputeStatusLabel } from "../lib/lead-vocabulary";
import { Badge, Card, Cluster, DataTable, Notice, PageHeader, PageStack, StatStrip } from "../lib/ui/broker-ui";
import type { DataTableColumn } from "../lib/ui/broker-ui";
import { disputeStatusTone, formatDate, formatXof } from "../lib/ui/broker-view-models";
import type { BrokerLeadDisputeView } from "../../../../packages/shared/contracts/lead-disputes.contracts";
import styles from "../lib/ui/broker-screens.module.css";

const BREADCRUMB = [{ label: "Compte" }, { label: "Facturation" }];

const STATUS_LABELS: Record<BrokerInvoiceData["status"], string> = {
  issued: "a regler",
  partially_paid: "partiellement reglee",
  paid: "reglee",
  cancelled: "annulee par avoir"
};
const STATUS_TONES = { issued: "warning", partially_paid: "info", paid: "success", cancelled: "disabled" } as const;

function xof(amount: number): string {
  return `${amount.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} XOF`;
}

const invoiceColumns: Array<DataTableColumn<BrokerInvoiceData>> = [
  { key: "number", header: "Facture", render: (invoice) => <span className="bo-ref">{invoice.number}</span> },
  { key: "period", header: "Periode", render: (invoice) => invoice.periodFrom.slice(0, 7) },
  { key: "issuedAt", header: "Emise le", render: (invoice) => invoice.issuedAt.slice(0, 10) },
  { key: "total", header: "Total TTC", render: (invoice) => xof(invoice.totalAmount), numeric: true, align: "right" },
  { key: "due", header: "Reste a regler", render: (invoice) => xof(invoice.amountDue), numeric: true, align: "right" },
  { key: "dueDate", header: "Echeance", render: (invoice) => invoice.dueDate },
  { key: "status", header: "Statut", render: (invoice) => <Badge tone={STATUS_TONES[invoice.status]}>{STATUS_LABELS[invoice.status]}</Badge> },
  {
    key: "pdf",
    header: "Documents",
    render: (invoice) => (
      <Cluster>
        <a href={`/billing/invoices/${invoice.id}/pdf`}>Telecharger le PDF</a>
        {invoice.creditNote ? <a href={`/billing/credit-notes/${invoice.creditNote.id}/pdf`}>Avoir {invoice.creditNote.number}</a> : null}
      </Cluster>
    )
  }
];

/** Credit applied to an accepted dispute: next draft invoice, partial credit note (PDF) or manual handling. */
function disputeCredit(dispute: BrokerLeadDisputeView) {
  if (dispute.status !== "accepted") return "-";
  if (dispute.creditMode === "credit_note") {
    return (
      <Cluster>
        <span>
          {DISPUTE_CREDIT_MODE_LABELS.credit_note}
          {dispute.creditNoteNumber ? ` ${dispute.creditNoteNumber}` : ""}
          {dispute.creditAmount !== undefined ? ` - ${formatXof(dispute.creditAmount)} TTC` : ""}
        </span>
        {dispute.creditNoteId ? <a href={`/billing/credit-notes/${dispute.creditNoteId}/pdf`}>Télécharger l'avoir (PDF)</a> : null}
      </Cluster>
    );
  }
  return DISPUTE_CREDIT_MODE_LABELS[dispute.creditMode ?? ""] ?? "Crédit en cours de traitement";
}

const disputeColumns: Array<DataTableColumn<BrokerLeadDisputeView>> = [
  {
    key: "reference",
    header: "Lead",
    render: (dispute) => (
      <a href={dispute.source === "crm" ? `/crm/leads/${dispute.leadAssignmentId}` : `/leads/${dispute.leadAssignmentId}`}>
        <code>{dispute.publicReference ?? dispute.leadAssignmentId}</code>
      </a>
    )
  },
  { key: "status", header: "Statut", render: (dispute) => <Badge tone={disputeStatusTone(dispute.status)}>{disputeStatusLabel(dispute.status)}</Badge> },
  { key: "reason", header: "Motif", render: (dispute) => disputeReasonLabel(dispute.reason) },
  { key: "createdAt", header: "Déposée le", render: (dispute) => formatDate(dispute.createdAt) },
  {
    key: "decision",
    header: "Décision",
    render: (dispute) =>
      dispute.decidedAt ? (
        <span>
          {formatDate(dispute.decidedAt)}
          {dispute.decisionReason ? ` - ${dispute.decisionReason}` : ""}
        </span>
      ) : (
        "En attente de la finance AssurMatch"
      )
  },
  { key: "credit", header: "Crédit appliqué", render: (dispute) => disputeCredit(dispute) }
];

/**
 * Spec 060 G-05: vue facturation du cabinet pour tous les plans (Starter compris). Lecture seule:
 * le reglement se fait hors plateforme (virement ou mobile money) et la finance AssurMatch le
 * constate. Les agents n'y ont pas acces (billing:read_own).
 */
export default async function BrokerBillingPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/billing", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/billing")}`);
  if (session.status !== "authenticated" || !isBrokerProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Fbilling");

  if (!canReadBrokerBilling(session.profile)) {
    return (
      <PageStack>
        <PageHeader breadcrumb={BREADCRUMB} title="Acces reserve" description="La facturation du cabinet est consultable par le responsable du compte, les managers et les membres en lecture seule." />
      </PageStack>
    );
  }

  const [statement, account, disputes] = await Promise.all([readBrokerBillingStatement(), readBrokerBillingAccount(), readBrokerDisputes()]);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={BREADCRUMB}
        title="Facturation du cabinet"
        description="Factures AssurMatch, solde, consommation du mois et packs de leads. Le reglement se fait par virement bancaire ou mobile money, hors plateforme, en rappelant le numero de facture."
      />

      <Notice tone="neutral">
        {account.data.notice || "Facturation manuelle: aucun paiement en ligne, aucune prime d'assurance encaissee par AssurMatch."}
      </Notice>

      {account.status !== "success" ? <Notice tone="warning">Etat des comptes temporairement indisponible.</Notice> : null}

      {account.status === "success" ? (
        <StatStrip
          label="Solde du cabinet"
          items={[
            { label: "Solde a regler", value: xof(account.data.totals.balanceDue), tone: account.data.totals.balanceDue > 0 ? "warning" : "neutral" },
            { label: "Total facture", value: xof(account.data.totals.invoiced) },
            { label: "Reglements constates", value: xof(account.data.totals.paid), tone: "success" },
            { label: "Avoirs", value: xof(account.data.totals.credited) },
            { label: "Credits pack restants", value: account.data.packCreditsRemaining }
          ]}
        />
      ) : null}

      <Card title="Factures et avoirs">
        <DataTable
          columns={invoiceColumns}
          items={account.data.invoices}
          getKey={(invoice) => invoice.id}
          emptyLabel="Aucune facture emise pour votre cabinet."
          emptyDescription="La facture du mois est emise par la finance AssurMatch apres la cloture du brouillon mensuel."
          aria-label="Factures du cabinet"
        />
      </Card>

      {statement.status === "success" ? (
        <section aria-label="Consommation du mois en cours" className="bo-stack">
          <div>
            <h2 className="bo-section-title">Consommation du mois en cours</h2>
            <p className={styles.muted}>Estimation indicative issue du brouillon mensuel; la facture du mois est emise ensuite par la finance AssurMatch.</p>
          </div>
          <StatStrip
            label="Consommation du mois en cours"
            items={[
              { label: "Leads recus (mois)", value: statement.data.leadsReceived },
              { label: "Leads facturables", value: statement.data.billableLeadCount, tone: "info" },
              { label: "Leads non facturables", value: statement.data.nonBillableLeadCount },
              { label: "Contestations creditees", value: statement.data.disputeCreditCount, tone: statement.data.disputeCreditCount > 0 ? "warning" : "neutral" },
              { label: "Montant estime HT", value: xof(statement.data.estimatedAmount), helper: "Estimation indicative" }
            ]}
          />
        </section>
      ) : null}

      <Card
        title="Contestations"
        description="Les leads que votre cabinet a contestés, la décision de la finance AssurMatch et le crédit appliqué (brouillon de facture ou avoir partiel)."
      >
        {disputes.status !== "success" ? <Notice tone="warning">Contestations temporairement indisponibles.</Notice> : null}
        <DataTable
          columns={disputeColumns}
          items={disputes.data.items}
          getKey={(dispute) => dispute.id}
          emptyLabel="Aucune contestation. Vous pouvez contester un lead dans les 30 jours suivant sa réception."
          aria-label="Contestations du cabinet"
        />
      </Card>

      <Card title="Releve de compte" description="Facture au debit, avoir et reglement au credit.">
        <DataTable
          columns={[
            { key: "date", header: "Date", render: (entry) => entry.date.slice(0, 10) },
            { key: "label", header: "Ecriture", render: (entry) => entry.label },
            { key: "debit", header: "Debit", render: (entry) => (entry.debit ? xof(entry.debit) : "-"), numeric: true, align: "right" },
            { key: "credit", header: "Credit", render: (entry) => (entry.credit ? xof(entry.credit) : "-"), numeric: true, align: "right" },
            { key: "balance", header: "Solde", render: (entry) => xof(entry.balance), numeric: true, align: "right" }
          ]}
          items={account.data.entries}
          getKey={(entry) => `${entry.kind}-${entry.documentId}`}
          emptyLabel="Aucune ecriture."
          aria-label="Releve de compte du cabinet"
        />
      </Card>

      <Card title="Packs de leads">
        <DataTable
          columns={[
            { key: "grantedAt", header: "Attribue le", render: (pack) => pack.grantedAt.slice(0, 10) },
            { key: "granted", header: "Credits", render: (pack) => pack.creditsGranted, numeric: true, align: "right" },
            { key: "consumed", header: "Consommes", render: (pack) => pack.creditsConsumed, numeric: true, align: "right" },
            { key: "remaining", header: "Restants", render: (pack) => pack.creditsRemaining, numeric: true, align: "right" },
            { key: "reason", header: "Origine", render: (pack) => pack.reason || "-" }
          ]}
          items={account.data.packs}
          getKey={(pack) => pack.id}
          emptyLabel="Aucun pack de leads."
          aria-label="Packs de leads du cabinet"
        />
      </Card>

      <InvoiceLinesSection invoices={account.data.invoices} />

      {isBrokerOwner(session.profile) ? <PlanChangeSection currentPlan={session.profile.partnerPlan} readOnly={isTenantReadOnly(session.profile)} /> : null}
    </PageStack>
  );
}
