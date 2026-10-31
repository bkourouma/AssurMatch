import { readAccountStatement, readBillingFoundation, readBillingPlans, readDraftInvoices, readIssuedInvoices, readLeadDispute, readLeadDisputes, readLeadPacks } from "../lib/admin-api";
import { readBackOfficeSession } from "../lib/backoffice-auth";
import { DISPUTE_DECIDER_ROLES, DISPUTE_PAGE_SIZE } from "../lib/dispute-vocabulary";
import { DisputesPanel } from "./disputes-panel";
import { DraftLinesPanel, Lot5BillingPanels } from "./lot5-panels";
import type { DisputeTabFilters } from "./disputes-panel";
import {
  grantLeadPackAction,
  issueCreditNoteAction,
  issueInvoiceAction,
  recomputeDraftInvoicesAction,
  recordInvoicePaymentAction,
  upsertBillingPlanAction
} from "../lib/billing-actions";
import {
  Badge,
  Button,
  Card,
  Cluster,
  ConfirmDialog,
  DataTable,
  Field,
  Form,
  FormActions,
  Grid,
  Input,
  PageHeader,
  PageStack,
  Select,
  StateMessage,
  StatStrip,
  Tabs,
  fieldControlProps,
  paginateItems,
  readTableParams,
  sortItems
} from "../lib/ui/admin-ui";
import type { DataTableColumn } from "../lib/ui/admin-ui";
import type { AccountStatementData, DraftInvoiceData, IssuedInvoiceData } from "../lib/admin-api";

const BILLING_NOTICES: Record<string, string> = {
  plan_saved: "Tarif de plan enregistré et audité.",
  drafts_computed: "Brouillons recalculés. Un brouillon déjà facturé reste inchangé.",
  pack_granted: "Pack de leads crédité au partenaire (aucun paiement encaissé par la plateforme).",
  invoice_issued: "Facture numérotée émise, PDF archivé et courtier notifié.",
  payment_recorded: "Paiement reçu hors plateforme enregistré et audité.",
  credit_note_issued: "Avoir numéroté émis: la facture est annulée, rien n'est supprimé.",
  conflict: "Opération refusée: état de la facture incompatible (déjà facturé, déjà payée, montant supérieur au solde ou facture non réglée).",
  not_found: "Brouillon ou facture introuvable.",
  disabled: "Module billing désactivé ou configuration de facturation incomplète (billing_enabled, mentions légales, TVA du pays).",
  forbidden: "Action refusée: rôle Finance Admin ou Super Admin requis.",
  invalid: "Saisie incomplète: vérifiez le plan, le pays et le motif.",
  error: "Billing temporairement indisponible.",
  // Spec 063 (CRM-012): decision on a lead dispute.
  dispute_accepted: "Contestation acceptée et auditée. Le cabinet est notifié ; le crédit appliqué est indiqué ci-dessous.",
  dispute_rejected: "Contestation rejetée et auditée. Le lead reste facturable et le cabinet est notifié.",
  dispute_invalid: "Décision incomplète : choisissez accepter ou rejeter et saisissez un motif de 10 à 1000 caractères.",
  dispute_already_decided: "Cette contestation a déjà été tranchée : la décision ne peut plus être modifiée.",
  dispute_billing_disabled: "La facturation n'est pas activée : activez billing_enabled avant de statuer sur une contestation."
};

const TABS = [
  { key: "suivi", label: "Suivi partenaires" },
  { key: "tarifs", label: "Tarifs" },
  { key: "brouillons", label: "Brouillons" },
  { key: "factures", label: "Factures" },
  { key: "comptes", label: "Comptes" },
  { key: "contestations", label: "Contestations" },
  { key: "packs", label: "Packs" }
];

/** Lot 5 (spec 071): add-on prices, assignments, subscription state and plan-change inbox (`billing:plan_manage`). */
const PLAN_MANAGER_ROLES = new Set(["finance_admin", "super_admin"]);
const MODULES_TAB = { key: "modules", label: "Modules et abonnements" };

const SUCCESS_NOTICES = new Set(["plan_saved", "drafts_computed", "pack_granted", "invoice_issued", "payment_recorded", "credit_note_issued", "dispute_accepted", "dispute_rejected"]);

/** Spec 060 invoice statuses, worded for finance (the raw status stays visible in the badge title). */
const INVOICE_STATUS_LABELS: Record<IssuedInvoiceData["status"], string> = {
  issued: "émise",
  partially_paid: "partiellement payée",
  paid: "payée",
  cancelled: "annulée par avoir"
};
const INVOICE_STATUS_TONES = { issued: "info", partially_paid: "warning", paid: "success", cancelled: "disabled" } as const;

const PAYMENT_METHOD_OPTIONS = [
  { value: "bank_transfer", label: "Virement bancaire" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "cheque", label: "Chèque" },
  { value: "other", label: "Autre (préciser dans la note)" }
];

function xof(amount: number): string {
  return `${amount.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} XOF`;
}

function invoiceColumns(): Array<DataTableColumn<IssuedInvoiceData>> {
  return [
    { key: "number", header: "Numéro", render: (invoice) => <span className="bo-ref">{invoice.number}</span> },
    { key: "partner", header: "Partenaire", render: (invoice) => <strong>{invoice.customer.legalName}</strong> },
    { key: "period", header: "Période", render: (invoice) => invoice.periodFrom.slice(0, 7) },
    { key: "total", header: "Total TTC", render: (invoice) => xof(invoice.totalAmount), numeric: true, align: "right" },
    { key: "paid", header: "Encaissé hors plateforme", render: (invoice) => xof(invoice.amountPaid), numeric: true, align: "right" },
    { key: "due", header: "Reste du", render: (invoice) => xof(invoice.amountDue), numeric: true, align: "right" },
    { key: "dueDate", header: "Échéance", render: (invoice) => invoice.dueDate },
    {
      key: "status",
      header: "Statut",
      render: (invoice) => (
        <Cluster>
          <Badge tone={INVOICE_STATUS_TONES[invoice.status]}>{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
          {invoice.legalMentionsComplete ? null : <Badge tone="danger">mentions à compléter</Badge>}
        </Cluster>
      )
    },
    {
      key: "documents",
      header: "Documents",
      render: (invoice) => (
        <Cluster>
          <a href={`/billing/invoices/${invoice.id}/pdf`}>PDF facture</a>
          {invoice.creditNote ? <a href={`/billing/credit-notes/${invoice.creditNote.id}/pdf`}>PDF avoir {invoice.creditNote.number}</a> : null}
        </Cluster>
      )
    }
  ];
}

const draftColumns: Array<DataTableColumn<DraftInvoiceData>> = [
  { key: "partner", header: "Partenaire", render: (draft) => <strong>{draft.partnerName}</strong>, sortable: true, sortValue: (draft) => draft.partnerName },
  { key: "reference", header: "Référence", render: (draft) => <span className="bo-ref">{draft.reference}</span>, sortable: true, sortValue: (draft) => draft.reference },
  { key: "billable", header: "Leads facturés", render: (draft) => draft.billableLeadCount, numeric: true, align: "right", sortable: true, sortValue: (draft) => draft.billableLeadCount },
  { key: "nonBillable", header: "Non facturables", render: (draft) => draft.nonBillableLeadCount, numeric: true, align: "right", sortable: true, sortValue: (draft) => draft.nonBillableLeadCount },
  { key: "packCredits", header: "Crédits pack", render: (draft) => draft.packCreditsUsed, numeric: true, align: "right" },
  { key: "disputeCredits", header: "Contestations créditées", render: (draft) => draft.disputeCreditCount, numeric: true, align: "right" },
  { key: "total", header: "Total brouillon", render: (draft) => `${draft.totalAmount} ${draft.currency}`, numeric: true, align: "right", sortable: true, sortValue: (draft) => draft.totalAmount },
  { key: "status", header: "Statut", render: (draft) => <Badge tone="disabled">{draft.status}</Badge>, sortable: true, sortValue: (draft) => draft.status }
];

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function BillingFoundationPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const notice = firstParam(params.billing);
  const requestedTab = firstParam(params.tab);
  const tab = [...TABS, MODULES_TAB].some((entry) => entry.key === requestedTab) ? requestedTab : "suivi";
  const lot5Session = await readBackOfficeSession();
  const canManagePlans = lot5Session.status === "authenticated" && lot5Session.profile.roles.some((role) => PLAN_MANAGER_ROLES.has(role));
  const accountPartnerId = firstParam(params.partner);
  const [billing, plans, drafts, packs, invoices] = await Promise.all([readBillingFoundation(), readBillingPlans(), readDraftInvoices(), readLeadPacks(), readIssuedInvoices()]);
  const account = tab === "comptes" && /^[0-9a-f-]{36}$/i.test(accountPartnerId) ? await readAccountStatement(accountPartnerId) : undefined;
  // Spec 063 FR-B10: disputes tab (filters live in the query string; dates are YYYY-MM-DD).
  const disputeFilters: DisputeTabFilters = {
    status: firstParam(params.status),
    partnerId: /^[0-9a-f-]{36}$/i.test(firstParam(params.partnerId)) ? firstParam(params.partnerId) : "",
    countryCode: /^[A-Za-z]{2}$/.test(firstParam(params.countryCode)) ? firstParam(params.countryCode).toUpperCase() : "",
    from: /^\d{4}-\d{2}-\d{2}$/.test(firstParam(params.from)) ? firstParam(params.from) : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(firstParam(params.to)) ? firstParam(params.to) : ""
  };
  const disputePage = Math.max(1, Number.parseInt(firstParam(params.page), 10) || 1);
  const disputeId = /^[A-Za-z0-9_-]{8,64}$/.test(firstParam(params.dispute)) ? firstParam(params.dispute) : "";
  const disputeTab = tab === "contestations"
    ? await Promise.all([
        readLeadDisputes({
          ...(["opened", "accepted", "rejected"].includes(disputeFilters.status) ? { status: disputeFilters.status } : {}),
          partnerId: disputeFilters.partnerId,
          countryCode: disputeFilters.countryCode,
          ...(disputeFilters.from ? { from: `${disputeFilters.from}T00:00:00.000Z` } : {}),
          ...(disputeFilters.to ? { to: `${disputeFilters.to}T23:59:59.999Z` } : {}),
          page: disputePage,
          pageSize: DISPUTE_PAGE_SIZE
        }),
        disputeId ? readLeadDispute(disputeId) : Promise.resolve(undefined),
        readBackOfficeSession()
      ])
    : undefined;
  const disputeSession = disputeTab?.[2];
  const canDecideDispute = disputeSession?.status === "authenticated" && disputeSession.profile.roles.some((role) => DISPUTE_DECIDER_ROLES.has(role));
  const issuedItems: IssuedInvoiceData[] = invoices.status === "success" ? invoices.data : [];
  const invoicedDraftIds = new Set(issuedItems.filter((invoice) => invoice.status !== "cancelled").map((invoice) => invoice.draftId));
  const issuableDrafts = (drafts.status === "success" ? drafts.data.items : []).filter((draft) => !invoicedDraftIds.has(draft.id) && draft.totalAmount > 0);
  const payableInvoices = issuedItems.filter((invoice) => invoice.status === "issued" || invoice.status === "partially_paid");
  const cancellableInvoices = issuedItems.filter((invoice) => invoice.status === "issued");

  const draftItems: DraftInvoiceData[] = drafts.status === "success" ? drafts.data.items : [];
  const table = readTableParams(params, {
    pathname: "/billing",
    defaultSort: { key: "partner", direction: "asc" },
    pageSize: 25
  });
  const draftRows = paginateItems(sortItems(draftItems, draftColumns, table.sort), table.page, table.pageSize);

  const hrefForTab = (key: string) => (key === "suivi" ? "/billing" : `/billing?tab=${key}`);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Partenaires" }, { label: "Facturation" }]}
        title="Facturation des courtiers"
        description="Brouillons mensuels, factures numérotées, paiements reçus hors plateforme (virement, mobile money) et avoirs. Aucun paiement en ligne et aucune prime d'assurance ne sont encaissés par AssurMatch."
      />

      {billing.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {billing.forbidden ? <StateMessage tone="danger">Accès billing refusé pour ce rôle admin.</StateMessage> : null}
      {billing.status === "error" ? <StateMessage tone="danger">Billing indisponible: {billing.error}</StateMessage> : null}
      {notice && BILLING_NOTICES[notice] ? <StateMessage tone={SUCCESS_NOTICES.has(notice) ? "info" : "warning"}>{BILLING_NOTICES[notice]}</StateMessage> : null}

      {billing.status === "success" ? (
        <>
          <StatStrip
            label="Synthèse billing foundation"
            items={[
              { label: "Partenaires suivis", value: billing.data.totals.partners },
              { label: "Leads acceptés (brouillon)", value: billing.data.totals.acceptedLeadCount, tone: "info" },
              { label: "Leads contestés", value: billing.data.totals.disputedLeadCount, tone: billing.data.totals.disputedLeadCount > 0 ? "warning" : "neutral" }
            ]}
          />

          <Tabs
            label="Sections facturation"
            items={(canManagePlans ? [...TABS, MODULES_TAB] : TABS).map((entry) => ({ label: entry.label, href: hrefForTab(entry.key), current: entry.key === tab }))}
          />

          {tab === "suivi" ? (
            <>
              <Card title="État module">
                <Cluster>
                  <Badge tone={billing.data.billingEnabled ? "warning" : "disabled"}>billing_enabled: {billing.data.billingEnabled ? "actif" : "désactivé"}</Badge>
                  <Badge tone="disabled">payments_enabled: désactivé</Badge>
                  <Badge tone="disabled">collection: désactivée</Badge>
                </Cluster>
                <Cluster aria-label="Restrictions">
                  {billing.data.restrictions.map((restriction) => <span key={restriction} className="bo-ref">{restriction}</span>)}
                </Cluster>
              </Card>
              <DataTable
                columns={[
                  { key: "partner", header: "Partenaire", render: (partner) => <strong>{partner.partnerName}</strong> },
                  { key: "plan", header: "Plan", render: (partner) => partner.plan },
                  { key: "accepted", header: "Leads acceptés", render: (partner) => partner.acceptedLeadCount, numeric: true, align: "right" },
                  { key: "disputed", header: "Contestés", render: (partner) => partner.disputedLeadCount, numeric: true, align: "right" },
                  { key: "reference", header: "Référence non facturable", render: (partner) => <span className="bo-ref">{partner.draftNonBillableReference}</span> },
                  { key: "invoiceStatus", header: "Statut", render: (partner) => <Badge tone="disabled">{partner.invoiceStatus}</Badge> }
                ]}
                items={billing.data.partners}
                getKey={(partner) => partner.partnerId}
                emptyLabel="Aucun partenaire dans la période courante."
                emptyDescription="Les compteurs apparaissent dès qu'un courtier partenaire accepte un lead sur la période."
                aria-label="Compteurs de leads par partenaire"
              />
            </>
          ) : null}

          {tab === "tarifs" ? (
            <Card
              title="Tarifs par plan et pays"
              description="Les tarifs alimentent les brouillons mensuels; la facture est émise ensuite depuis l'onglet Factures. Aucune prime n'est collectée par AssurMatch."
            >
              <DataTable
                columns={[
                  { key: "plan", header: "Plan", render: (price) => price.plan },
                  { key: "country", header: "Pays", render: (price) => price.countryCode },
                  { key: "subscription", header: "Abonnement mensuel", render: (price) => `${price.monthlySubscription} ${price.currency}`, numeric: true, align: "right" },
                  { key: "perLead", header: "Prix par lead", render: (price) => `${price.perLeadPrice} ${price.currency}`, numeric: true, align: "right" },
                  { key: "setup", header: "Frais d'installation", render: (price) => `${price.setupFee} ${price.currency}`, numeric: true, align: "right" }
                ]}
                items={plans.status === "success" ? plans.data : []}
                getKey={(price) => price.id}
                emptyLabel="Aucun tarif défini."
                aria-label="Tarifs par plan et pays"
              />
              <Form action={upsertBillingPlanAction} columns={2}>
                <Field id="billing-plan" label="Plan">
                  <Select
                    {...fieldControlProps("billing-plan")}
                    name="plan"
                    defaultValue="pro"
                    options={[
                      { value: "starter", label: "starter" },
                      { value: "pro", label: "pro" },
                      { value: "enterprise", label: "enterprise" }
                    ]}
                  />
                </Field>
                <Field id="billing-country" label="Pays (ISO)">
                  <Input {...fieldControlProps("billing-country")} name="countryCode" maxLength={2} placeholder="CI" />
                </Field>
                <Field id="billing-subscription" label="Abonnement mensuel">
                  <Input {...fieldControlProps("billing-subscription")} name="monthlySubscription" type="number" min={0} step={100} defaultValue={0} />
                </Field>
                <Field id="billing-per-lead" label="Prix par lead">
                  <Input {...fieldControlProps("billing-per-lead")} name="perLeadPrice" type="number" min={0} step={100} defaultValue={0} />
                </Field>
                <Field id="billing-setup" label="Frais d'installation">
                  <Input {...fieldControlProps("billing-setup")} name="setupFee" type="number" min={0} step={100} defaultValue={0} />
                </Field>
                <Field id="billing-plan-reason" label="Motif">
                  <Input {...fieldControlProps("billing-plan-reason")} name="reason" placeholder="Motif du changement de tarif" />
                </Field>
                <FormActions>
                  <Button type="submit" variant="secondary">Enregistrer le tarif</Button>
                </FormActions>
              </Form>
            </Card>
          ) : null}

          {tab === "modules" && canManagePlans ? (
            <Lot5BillingPanels
              partners={billing.data.partners.map((partner) => ({ partnerId: partner.partnerId, partnerName: partner.partnerName }))}
              subscriptionPartnerId={firstParam(params.abonnement)}
              planStatus={firstParam(params.planStatus)}
            />
          ) : null}
          {tab === "modules" && !canManagePlans ? <StateMessage tone="warning">Modules et abonnements : rôle Finance Admin ou Super Admin requis.</StateMessage> : null}

          {tab === "brouillons" ? (
            <>
            <Card title="Brouillons mensuels non facturables">
              <DataTable
                columns={draftColumns}
                items={draftRows}
                getKey={(draft) => draft.id}
                emptyLabel="Aucun brouillon calculé."
                aria-label="Brouillons mensuels non facturables"
                sort={table.sort}
                sortHref={table.sortHref}
                pagination={{
                  page: table.page,
                  pageSize: table.pageSize,
                  total: draftItems.length,
                  hrefFor: table.pageHref,
                  label: (from, to, total) => `${from}-${to} sur ${total} brouillons`
                }}
              />
              <Form action={recomputeDraftInvoicesAction} columns={2}>
                <Field id="billing-draft-partner" label="Partenaire (optionnel)">
                  <Input {...fieldControlProps("billing-draft-partner")} name="partnerId" placeholder="Identifiant partenaire" />
                </Field>
                <Field id="billing-draft-reason" label="Motif">
                  <Input {...fieldControlProps("billing-draft-reason")} name="reason" placeholder="Motif du recalcul" />
                </Field>
                <FormActions>
                  <Button type="submit" variant="secondary">Recalculer les brouillons</Button>
                </FormActions>
              </Form>
            </Card>
            <DraftLinesPanel drafts={draftItems} />
            </>
          ) : null}

          {tab === "factures" ? (
            <>
              <Card
                title="Factures B2B numérotées"
                description="Une facture émise est définitive: numéro séquentiel par pays, PDF archivé avec empreinte, TVA du pays. Une erreur se corrige par un avoir, jamais par une suppression."
              >
                <DataTable
                  columns={invoiceColumns()}
                  items={issuedItems}
                  getKey={(invoice) => invoice.id}
                  emptyLabel="Aucune facture numérotée."
                  aria-label="Factures B2B numérotées"
                />
              </Card>

              <Grid columns="two">
                <Card title="Émettre la facture d'un brouillon" description="Fige le brouillon du mois, alloue le numéro, génère le PDF et notifie le courtier dans son espace.">
                  <Form action={issueInvoiceAction}>
                    <Field id="invoice-draft" label="Brouillon à facturer">
                      <Select
                        {...fieldControlProps("invoice-draft")}
                        name="draftId"
                        defaultValue=""
                        placeholder={issuableDrafts.length ? "Choisir un brouillon" : "Aucun brouillon facturable"}
                        options={issuableDrafts.map((draft) => ({ value: draft.id, label: `${draft.partnerName} - ${draft.reference} - ${xof(draft.totalAmount)} HT` }))}
                      />
                    </Field>
                    <Field id="invoice-reason" label="Motif">
                      <Input {...fieldControlProps("invoice-reason")} name="reason" placeholder="Clôture mensuelle" />
                    </Field>
                    <FormActions>
                      <Button type="submit">Émettre la facture</Button>
                    </FormActions>
                  </Form>
                </Card>

                <Card title="Enregistrer un paiement reçu" description="Constat d'un virement ou d'un mobile money reçu hors plateforme. Le montant ne peut pas dépasser le reste du.">
                  <Form action={recordInvoicePaymentAction} columns={2}>
                    <Field id="payment-invoice" label="Facture">
                      <Select
                        {...fieldControlProps("payment-invoice")}
                        name="invoiceId"
                        defaultValue=""
                        placeholder={payableInvoices.length ? "Choisir une facture" : "Aucune facture à régler"}
                        options={payableInvoices.map((invoice) => ({ value: invoice.id, label: `${invoice.number} - ${invoice.customer.legalName} - reste ${xof(invoice.amountDue)}` }))}
                      />
                    </Field>
                    <Field id="payment-amount" label="Montant reçu (XOF)">
                      <Input {...fieldControlProps("payment-amount")} name="amount" type="number" min={1} step={1} />
                    </Field>
                    <Field id="payment-date" label="Date de réception">
                      <Input {...fieldControlProps("payment-date")} name="receivedAt" type="date" />
                    </Field>
                    <Field id="payment-method" label="Moyen">
                      <Select {...fieldControlProps("payment-method")} name="method" defaultValue="bank_transfer" options={PAYMENT_METHOD_OPTIONS} />
                    </Field>
                    <Field id="payment-reference" label="Référence du virement ou de la transaction">
                      <Input {...fieldControlProps("payment-reference")} name="reference" placeholder="VIR-2026-10-001" />
                    </Field>
                    <Field id="payment-note" label="Note (optionnelle)">
                      <Input {...fieldControlProps("payment-note")} name="note" />
                    </Field>
                    <FormActions>
                      <Button type="submit" variant="secondary">Enregistrer le paiement</Button>
                    </FormActions>
                  </Form>
                </Card>
              </Grid>

              <Card title="Émettre un avoir" description="Annule intégralement une facture non réglée avec un avoir numéroté (série AV). La facture reste consultable.">
                <Cluster>
                  <ConfirmDialog
                    triggerLabel="Émettre l'avoir"
                    triggerVariant="danger"
                    title="Émettre un avoir"
                    description="La facture choisie sera annulée intégralement par un avoir numéroté. Cette opération est définitive."
                    confirmLabel="Émettre l'avoir"
                    cancelLabel="Annuler"
                    tone="danger"
                    formAction={issueCreditNoteAction}
                  >
                    <Field id="credit-note-invoice" label="Facture à annuler">
                      <Select
                        {...fieldControlProps("credit-note-invoice")}
                        name="invoiceId"
                        defaultValue=""
                        placeholder={cancellableInvoices.length ? "Choisir une facture" : "Aucune facture annulable"}
                        options={cancellableInvoices.map((invoice) => ({ value: invoice.id, label: `${invoice.number} - ${invoice.customer.legalName} - ${xof(invoice.totalAmount)}` }))}
                      />
                    </Field>
                    <Field id="credit-note-reason" label="Motif de l'avoir">
                      <Input {...fieldControlProps("credit-note-reason")} name="reason" placeholder="Erreur sur la période facturée" />
                    </Field>
                  </ConfirmDialog>
                </Cluster>
              </Card>
            </>
          ) : null}

          {tab === "comptes" ? (
            <>
              <Card title="État des comptes courtier" description="Écritures chronologiques: facture au débit, avoir et paiement au crédit.">
                <Form method="get" action="/billing" columns={2}>
                  <input type="hidden" name="tab" value="comptes" />
                  <Field id="account-partner" label="Partenaire">
                    <Select
                      {...fieldControlProps("account-partner")}
                      name="partner"
                      defaultValue={accountPartnerId}
                      placeholder="Choisir un partenaire"
                      options={billing.data.partners.map((partner) => ({ value: partner.partnerId, label: partner.partnerName }))}
                    />
                  </Field>
                  <FormActions>
                    <Button type="submit" variant="secondary">Afficher le compte</Button>
                  </FormActions>
                </Form>
              </Card>
              {account?.status === "success" && account.data ? <AccountPanel account={account.data} /> : null}
              {account && account.status !== "success" ? <StateMessage tone="danger">État des comptes indisponible ({account.error}).</StateMessage> : null}
            </>
          ) : null}

          {tab === "contestations" && disputeTab ? (
            <DisputesPanel
              filters={disputeFilters}
              list={disputeTab[0]}
              detail={disputeTab[1]}
              partners={billing.data.partners}
              canDecide={canDecideDispute === true}
              page={disputePage}
            />
          ) : null}

          {tab === "packs" ? (
            <Card title="Packs de leads prépayés">
              <DataTable
                columns={[
                  { key: "partner", header: "Partenaire", render: (pack) => <span className="bo-ref">{pack.partnerId}</span> },
                  { key: "granted", header: "Crédits", render: (pack) => pack.creditsGranted, numeric: true, align: "right" },
                  { key: "consumed", header: "Consommés", render: (pack) => pack.creditsConsumed, numeric: true, align: "right" },
                  { key: "remaining", header: "Restants", render: (pack) => pack.creditsRemaining, numeric: true, align: "right" },
                  { key: "reason", header: "Motif", render: (pack) => pack.reason },
                  { key: "invoice", header: "Facture liée", render: (pack) => pack.invoiceId ? <span className="bo-ref">{issuedItems.find((invoice) => invoice.id === pack.invoiceId)?.number ?? pack.invoiceId}</span> : "-" }
                ]}
                items={packs.status === "success" ? packs.data : []}
                getKey={(pack) => pack.id}
                emptyLabel="Aucun pack accordé."
                aria-label="Packs de leads prépayés"
              />
              <Form action={grantLeadPackAction} columns={2}>
                <Field id="billing-pack-partner" label="Partenaire">
                  <Input {...fieldControlProps("billing-pack-partner")} name="partnerId" placeholder="Identifiant partenaire" />
                </Field>
                <Field id="billing-pack-credits" label="Crédits">
                  <Input {...fieldControlProps("billing-pack-credits")} name="credits" type="number" min={1} step={1} defaultValue={10} />
                </Field>
                <Field id="billing-pack-reason" label="Motif">
                  <Input {...fieldControlProps("billing-pack-reason")} name="reason" placeholder="Motif du pack" />
                </Field>
                <Field id="billing-pack-invoice" label="Facture réglée (optionnel)">
                  <Select
                    {...fieldControlProps("billing-pack-invoice")}
                    name="invoiceId"
                    defaultValue=""
                    options={[
                      { value: "", label: "Aucune facture liée" },
                      ...issuedItems
                        .filter((invoice) => invoice.status === "paid" || invoice.status === "partially_paid")
                        .map((invoice) => ({ value: invoice.id, label: `${invoice.number} - ${invoice.customer.legalName}` }))
                    ]}
                  />
                </Field>
                <FormActions>
                  <Button type="submit" variant="secondary">Créditer un pack</Button>
                </FormActions>
              </Form>
            </Card>
          ) : null}
        </>
      ) : null}
    </PageStack>
  );
}

/** Spec 060 FR-13: balance, entries and packs of one partner; a pack can cite a settled invoice. */
function AccountPanel({ account }: { account: AccountStatementData }) {
  const settled = account.invoices.filter((invoice) => invoice.status === "paid" || invoice.status === "partially_paid");
  return (
    <>
      <StatStrip
        label="Synthèse du compte courtier"
        items={[
          { label: "Facture TTC", value: xof(account.totals.invoiced) },
          { label: "Avoirs", value: xof(account.totals.credited) },
          { label: "Paiements constatés", value: xof(account.totals.paid), tone: "success" },
          { label: "Solde du", value: xof(account.totals.balanceDue), tone: account.totals.balanceDue > 0 ? "warning" : "neutral" },
          { label: "Crédits pack restants", value: account.packCreditsRemaining }
        ]}
      />
      <Card title="Écritures du compte">
        <DataTable
          columns={[
            { key: "date", header: "Date", render: (entry) => entry.date.slice(0, 10) },
            { key: "label", header: "Écriture", render: (entry) => entry.label },
            { key: "reference", header: "Référence", render: (entry) => <span className="bo-ref">{entry.reference}</span> },
            { key: "debit", header: "Débit", render: (entry) => (entry.debit ? xof(entry.debit) : "-"), numeric: true, align: "right" },
            { key: "credit", header: "Crédit", render: (entry) => (entry.credit ? xof(entry.credit) : "-"), numeric: true, align: "right" },
            { key: "balance", header: "Solde", render: (entry) => xof(entry.balance), numeric: true, align: "right" }
          ]}
          items={account.entries}
          getKey={(entry) => `${entry.kind}-${entry.documentId}`}
          emptyLabel="Aucune écriture pour ce partenaire."
          aria-label="Écritures du compte courtier"
        />
        <p className="bo-description">{account.notice}</p>
      </Card>
      <Card title="Attribuer un pack après paiement constaté" description="Le pack est lié à la facture réglée; aucun paiement n'est capturé par cette action.">
        <Form action={grantLeadPackAction} columns={2}>
          <input type="hidden" name="partnerId" value={account.partnerId} />
          <input type="hidden" name="returnTab" value="comptes" />
          <Field id="account-pack-invoice" label="Facture réglée">
            <Select
              {...fieldControlProps("account-pack-invoice")}
              name="invoiceId"
              defaultValue=""
              placeholder={settled.length ? "Choisir une facture" : "Aucune facture réglée"}
              options={settled.map((invoice) => ({ value: invoice.id, label: `${invoice.number} - ${xof(invoice.amountPaid)} reçus` }))}
            />
          </Field>
          <Field id="account-pack-credits" label="Crédits">
            <Input {...fieldControlProps("account-pack-credits")} name="credits" type="number" min={1} step={1} defaultValue={10} />
          </Field>
          <Field id="account-pack-reason" label="Motif">
            <Input {...fieldControlProps("account-pack-reason")} name="reason" placeholder="Pack règle par virement" />
          </Field>
          <FormActions>
            <Button type="submit" variant="secondary">Attribuer le pack</Button>
          </FormActions>
        </Form>
      </Card>
    </>
  );
}
