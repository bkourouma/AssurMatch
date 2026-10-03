import { redirect } from "next/navigation";
import { isBrokerProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readBrokerBillingAccount, readBrokerBillingStatement, type BrokerInvoiceData } from "../lib/broker-api";
import { canReadBrokerBilling } from "../lib/broker-permissions";
import { Badge, Card, Cluster, DataTable, Grid, KpiCard, Notice, PageHeader, PageStack } from "../lib/ui/broker-ui";
import type { DataTableColumn } from "../lib/ui/broker-ui";

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
  { key: "number", header: "Facture", render: (invoice) => <code>{invoice.number}</code> },
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
        <PageHeader breadcrumb={BREADCRUMB} kicker="Facturation" title="Acces reserve" description="La facturation du cabinet est consultable par le responsable du compte, les managers et les membres en lecture seule." />
      </PageStack>
    );
  }

  const [statement, account] = await Promise.all([readBrokerBillingStatement(), readBrokerBillingAccount()]);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={BREADCRUMB}
        kicker="Facturation"
        title="Facturation du cabinet"
        description="Consommation du mois, factures AssurMatch, solde et packs de leads. Le reglement se fait par virement bancaire ou mobile money, hors plateforme, en rappelant le numero de facture."
      />

      {account.status !== "success" ? <Notice tone="warning">Etat des comptes temporairement indisponible.</Notice> : null}

      {account.status === "success" ? (
        <Grid columns="kpi" as="section" aria-label="Solde du cabinet">
          <KpiCard label="Solde a regler" value={xof(account.data.totals.balanceDue)} tone={account.data.totals.balanceDue > 0 ? "warning" : "neutral"} />
          <KpiCard label="Total facture" value={xof(account.data.totals.invoiced)} />
          <KpiCard label="Reglements constates" value={xof(account.data.totals.paid)} tone="success" />
          <KpiCard label="Avoirs" value={xof(account.data.totals.credited)} />
          <KpiCard label="Credits pack restants" value={account.data.packCreditsRemaining} />
        </Grid>
      ) : null}

      {statement.status === "success" ? (
        <Card title="Consommation du mois en cours" description="Estimation indicative issue du brouillon mensuel; la facture du mois est emise ensuite par la finance AssurMatch.">
          <Grid columns="kpi">
            <KpiCard label="Leads recus (mois)" value={statement.data.leadsReceived} />
            <KpiCard label="Leads facturables" value={statement.data.billableLeadCount} tone="info" />
            <KpiCard label="Leads non facturables" value={statement.data.nonBillableLeadCount} />
            <KpiCard label="Contestations creditees" value={statement.data.disputeCreditCount} tone="warning" />
            <KpiCard label="Montant estime HT" value={xof(statement.data.estimatedAmount)} helper="Estimation indicative" />
          </Grid>
        </Card>
      ) : null}

      <Card title="Factures et avoirs">
        <DataTable
          columns={invoiceColumns}
          items={account.data.invoices}
          getKey={(invoice) => invoice.id}
          emptyLabel="Aucune facture emise pour votre cabinet."
          aria-label="Factures du cabinet"
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
            { key: "remaining", header: "Restants", render: (pack) => pack.creditsRemaining, numeric: true, align: "right" }
          ]}
          items={account.data.packs}
          getKey={(pack) => pack.id}
          emptyLabel="Aucun pack de leads."
          aria-label="Packs de leads du cabinet"
        />
      </Card>

      <Notice tone="info">
        {account.data.notice || "Facturation manuelle: aucun paiement en ligne, aucune prime d'assurance encaissee par AssurMatch."}
      </Notice>
    </PageStack>
  );
}
