import { readAccountStatement, readBillingFoundation, readBillingPlans, readDraftInvoices, readIssuedInvoices, readLeadPacks } from "../lib/admin-api";
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
  DataTable,
  Field,
  Form,
  FormActions,
  Grid,
  Input,
  KpiCard,
  PageHeader,
  PageStack,
  Select,
  StateMessage,
  Tabs,
  fieldControlProps,
  paginateItems,
  readTableParams,
  sortItems
} from "../lib/ui/admin-ui";
import type { DataTableColumn } from "../lib/ui/admin-ui";
import type { AccountStatementData, DraftInvoiceData, IssuedInvoiceData } from "../lib/admin-api";

const BILLING_NOTICES: Record<string, string> = {
  plan_saved: "Tarif de plan enregistre et audite.",
  drafts_computed: "Brouillons recalcules. Un brouillon deja facture reste inchange.",
  pack_granted: "Pack de leads credite au partenaire (aucun paiement encaisse par la plateforme).",
  invoice_issued: "Facture numerotee emise, PDF archive et courtier notifie.",
  payment_recorded: "Paiement recu hors plateforme enregistre et audite.",
  credit_note_issued: "Avoir numerote emis: la facture est annulee, rien n'est supprime.",
  conflict: "Operation refusee: etat de la facture incompatible (deja facture, deja payee, montant superieur au solde ou facture non reglee).",
  not_found: "Brouillon ou facture introuvable.",
  disabled: "Module billing desactive ou configuration de facturation incomplete (billing_enabled, mentions legales, TVA du pays).",
  forbidden: "Action refusee: role Finance Admin ou Super Admin requis.",
  invalid: "Saisie incomplete: verifiez le plan, le pays et le motif.",
  error: "Billing temporairement indisponible."
};

const TABS = [
  { key: "suivi", label: "Suivi partenaires" },
  { key: "tarifs", label: "Tarifs" },
  { key: "brouillons", label: "Brouillons" },
  { key: "factures", label: "Factures" },
  { key: "comptes", label: "Comptes" },
  { key: "packs", label: "Packs" }
];

const SUCCESS_NOTICES = new Set(["plan_saved", "drafts_computed", "pack_granted", "invoice_issued", "payment_recorded", "credit_note_issued"]);

/** Spec 060 invoice statuses, worded for finance (the raw status stays visible in the badge title). */
const INVOICE_STATUS_LABELS: Record<IssuedInvoiceData["status"], string> = {
  issued: "emise",
  partially_paid: "partiellement payee",
  paid: "payee",
  cancelled: "annulee par avoir"
};
const INVOICE_STATUS_TONES = { issued: "info", partially_paid: "warning", paid: "success", cancelled: "disabled" } as const;

const PAYMENT_METHOD_OPTIONS = [
  { value: "bank_transfer", label: "Virement bancaire" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Autre (preciser dans la note)" }
];

function xof(amount: number): string {
  return `${amount.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} XOF`;
}

function invoiceColumns(): Array<DataTableColumn<IssuedInvoiceData>> {
  return [
    { key: "number", header: "Numero", render: (invoice) => <code>{invoice.number}</code> },
    { key: "partner", header: "Partenaire", render: (invoice) => <strong>{invoice.customer.legalName}</strong> },
    { key: "period", header: "Periode", render: (invoice) => invoice.periodFrom.slice(0, 7) },
    { key: "total", header: "Total TTC", render: (invoice) => xof(invoice.totalAmount), numeric: true, align: "right" },
    { key: "paid", header: "Encaisse hors plateforme", render: (invoice) => xof(invoice.amountPaid), numeric: true, align: "right" },
    { key: "due", header: "Reste du", render: (invoice) => xof(invoice.amountDue), numeric: true, align: "right" },
    { key: "dueDate", header: "Echeance", render: (invoice) => invoice.dueDate },
    {
      key: "status",
      header: "Statut",
      render: (invoice) => (
        <Cluster>
          <Badge tone={INVOICE_STATUS_TONES[invoice.status]}>{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
          {invoice.legalMentionsComplete ? null : <Badge tone="danger">mentions a completer</Badge>}
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
  { key: "reference", header: "Reference", render: (draft) => <code>{draft.reference}</code>, sortable: true, sortValue: (draft) => draft.reference },
  { key: "billable", header: "Leads factures", render: (draft) => draft.billableLeadCount, numeric: true, align: "right", sortable: true, sortValue: (draft) => draft.billableLeadCount },
  { key: "nonBillable", header: "Non facturables", render: (draft) => draft.nonBillableLeadCount, numeric: true, align: "right", sortable: true, sortValue: (draft) => draft.nonBillableLeadCount },
  { key: "packCredits", header: "Credits pack", render: (draft) => draft.packCreditsUsed, numeric: true, align: "right" },
  { key: "disputeCredits", header: "Contestations creditees", render: (draft) => draft.disputeCreditCount, numeric: true, align: "right" },
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
  const tab = TABS.some((entry) => entry.key === requestedTab) ? requestedTab : "suivi";
  const accountPartnerId = firstParam(params.partner);
  const [billing, plans, drafts, packs, invoices] = await Promise.all([readBillingFoundation(), readBillingPlans(), readDraftInvoices(), readLeadPacks(), readIssuedInvoices()]);
  const account = tab === "comptes" && /^[0-9a-f-]{36}$/i.test(accountPartnerId) ? await readAccountStatement(accountPartnerId) : undefined;
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
        kicker="Facturation B2B manuelle"
        title="Facturation des courtiers"
        description="Brouillons mensuels, factures numerotees, paiements recus hors plateforme (virement, mobile money) et avoirs. Aucun paiement en ligne et aucune prime d'assurance ne sont encaisses par AssurMatch."
      />

      {billing.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {billing.forbidden ? <StateMessage tone="danger">Acces billing refuse pour ce role admin.</StateMessage> : null}
      {billing.status === "error" ? <StateMessage tone="danger">Billing indisponible: {billing.error}</StateMessage> : null}
      {notice && BILLING_NOTICES[notice] ? <StateMessage tone={SUCCESS_NOTICES.has(notice) ? "info" : "warning"}>{BILLING_NOTICES[notice]}</StateMessage> : null}

      {billing.status === "success" ? (
        <>
          <Grid columns="kpi" as="section" aria-label="Synthese billing foundation">
            <KpiCard label="Partenaires suivis" value={billing.data.totals.partners} />
            <KpiCard label="Leads acceptes (brouillon)" value={billing.data.totals.acceptedLeadCount} tone="info" />
            <KpiCard label="Leads contestes" value={billing.data.totals.disputedLeadCount} tone="warning" />
          </Grid>

          <Tabs
            label="Sections facturation"
            items={TABS.map((entry) => ({ label: entry.label, href: hrefForTab(entry.key), current: entry.key === tab }))}
          />

          {tab === "suivi" ? (
            <>
              <Grid columns="two">
                <Card title="Etat module">
                  <Cluster>
                    <Badge tone={billing.data.billingEnabled ? "warning" : "disabled"}>billing_enabled: {billing.data.billingEnabled ? "actif" : "desactive"}</Badge>
                    <Badge tone="disabled">payments_enabled: desactive</Badge>
                    <Badge tone="disabled">collection: desactivee</Badge>
                  </Cluster>
                </Card>
                <Card title="Restrictions">
                  <ul className="bo-list">
                    {billing.data.restrictions.map((restriction) => <li key={restriction}>{restriction}</li>)}
                  </ul>
                </Card>
              </Grid>

              <Card>
                <DataTable
                  columns={[
                    { key: "partner", header: "Partenaire", render: (partner) => <strong>{partner.partnerName}</strong> },
                    { key: "plan", header: "Plan", render: (partner) => partner.plan },
                    { key: "accepted", header: "Leads acceptes", render: (partner) => partner.acceptedLeadCount, numeric: true, align: "right" },
                    { key: "disputed", header: "Contestes", render: (partner) => partner.disputedLeadCount, numeric: true, align: "right" },
                    { key: "reference", header: "Reference non facturable", render: (partner) => <code>{partner.draftNonBillableReference}</code> },
                    { key: "invoiceStatus", header: "Statut", render: (partner) => <Badge tone="disabled">{partner.invoiceStatus}</Badge> }
                  ]}
                  items={billing.data.partners}
                  getKey={(partner) => partner.partnerId}
                  emptyLabel="Aucun partenaire dans la periode courante."
                  aria-label="Compteurs de leads par partenaire"
                />
              </Card>
            </>
          ) : null}

          {tab === "tarifs" ? (
            <Card
              title="Tarifs par plan et pays"
              description="Les tarifs alimentent les brouillons mensuels; la facture est emise ensuite depuis l'onglet Factures. Aucune prime n'est collectee par AssurMatch."
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
                emptyLabel="Aucun tarif defini."
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

          {tab === "brouillons" ? (
            <Card title="Brouillons mensuels non facturables">
              <DataTable
                columns={draftColumns}
                items={draftRows}
                getKey={(draft) => draft.id}
                emptyLabel="Aucun brouillon calcule."
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
          ) : null}

          {tab === "factures" ? (
            <>
              <Card
                title="Factures B2B numerotees"
                description="Une facture emise est definitive: numero sequentiel par pays, PDF archive avec empreinte, TVA du pays. Une erreur se corrige par un avoir, jamais par une suppression."
              >
                <DataTable
                  columns={invoiceColumns()}
                  items={issuedItems}
                  getKey={(invoice) => invoice.id}
                  emptyLabel="Aucune facture numerotee."
                  aria-label="Factures B2B numerotees"
                />
              </Card>

              <Grid columns="two">
                <Card title="Emettre la facture d'un brouillon" description="Fige le brouillon du mois, alloue le numero, genere le PDF et notifie le courtier dans son espace.">
                  <Form action={issueInvoiceAction}>
                    <Field id="invoice-draft" label="Brouillon a facturer">
                      <Select
                        {...fieldControlProps("invoice-draft")}
                        name="draftId"
                        defaultValue=""
                        placeholder={issuableDrafts.length ? "Choisir un brouillon" : "Aucun brouillon facturable"}
                        options={issuableDrafts.map((draft) => ({ value: draft.id, label: `${draft.partnerName} - ${draft.reference} - ${xof(draft.totalAmount)} HT` }))}
                      />
                    </Field>
                    <Field id="invoice-reason" label="Motif">
                      <Input {...fieldControlProps("invoice-reason")} name="reason" placeholder="Cloture mensuelle" />
                    </Field>
                    <FormActions>
                      <Button type="submit">Emettre la facture</Button>
                    </FormActions>
                  </Form>
                </Card>

                <Card title="Enregistrer un paiement recu" description="Constat d'un virement ou d'un mobile money recu hors plateforme. Le montant ne peut pas depasser le reste du.">
                  <Form action={recordInvoicePaymentAction} columns={2}>
                    <Field id="payment-invoice" label="Facture">
                      <Select
                        {...fieldControlProps("payment-invoice")}
                        name="invoiceId"
                        defaultValue=""
                        placeholder={payableInvoices.length ? "Choisir une facture" : "Aucune facture a regler"}
                        options={payableInvoices.map((invoice) => ({ value: invoice.id, label: `${invoice.number} - ${invoice.customer.legalName} - reste ${xof(invoice.amountDue)}` }))}
                      />
                    </Field>
                    <Field id="payment-amount" label="Montant recu (XOF)">
                      <Input {...fieldControlProps("payment-amount")} name="amount" type="number" min={1} step={1} />
                    </Field>
                    <Field id="payment-date" label="Date de reception">
                      <Input {...fieldControlProps("payment-date")} name="receivedAt" type="date" />
                    </Field>
                    <Field id="payment-method" label="Moyen">
                      <Select {...fieldControlProps("payment-method")} name="method" defaultValue="bank_transfer" options={PAYMENT_METHOD_OPTIONS} />
                    </Field>
                    <Field id="payment-reference" label="Reference du virement ou de la transaction">
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

              <Card title="Emettre un avoir" description="Annule integralement une facture non reglee avec un avoir numerote (serie AV). La facture reste consultable.">
                <Form action={issueCreditNoteAction} columns={2}>
                  <Field id="credit-note-invoice" label="Facture a annuler">
                    <Select
                      {...fieldControlProps("credit-note-invoice")}
                      name="invoiceId"
                      defaultValue=""
                      placeholder={cancellableInvoices.length ? "Choisir une facture" : "Aucune facture annulable"}
                      options={cancellableInvoices.map((invoice) => ({ value: invoice.id, label: `${invoice.number} - ${invoice.customer.legalName} - ${xof(invoice.totalAmount)}` }))}
                    />
                  </Field>
                  <Field id="credit-note-reason" label="Motif de l'avoir">
                    <Input {...fieldControlProps("credit-note-reason")} name="reason" placeholder="Erreur sur la periode facturee" />
                  </Field>
                  <FormActions>
                    <Button type="submit" variant="danger">Emettre l'avoir</Button>
                  </FormActions>
                </Form>
              </Card>
            </>
          ) : null}

          {tab === "comptes" ? (
            <>
              <Card title="Etat des comptes courtier" description="Ecritures chronologiques: facture au debit, avoir et paiement au credit.">
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
              {account && account.status !== "success" ? <StateMessage tone="danger">Etat des comptes indisponible ({account.error}).</StateMessage> : null}
            </>
          ) : null}

          {tab === "packs" ? (
            <Card title="Packs de leads prepayes">
              <DataTable
                columns={[
                  { key: "partner", header: "Partenaire", render: (pack) => <code>{pack.partnerId}</code> },
                  { key: "granted", header: "Credits", render: (pack) => pack.creditsGranted, numeric: true, align: "right" },
                  { key: "consumed", header: "Consommes", render: (pack) => pack.creditsConsumed, numeric: true, align: "right" },
                  { key: "remaining", header: "Restants", render: (pack) => pack.creditsRemaining, numeric: true, align: "right" },
                  { key: "reason", header: "Motif", render: (pack) => pack.reason },
                  { key: "invoice", header: "Facture liee", render: (pack) => pack.invoiceId ? <code>{issuedItems.find((invoice) => invoice.id === pack.invoiceId)?.number ?? pack.invoiceId}</code> : "-" }
                ]}
                items={packs.status === "success" ? packs.data : []}
                getKey={(pack) => pack.id}
                emptyLabel="Aucun pack accorde."
                aria-label="Packs de leads prepayes"
              />
              <Form action={grantLeadPackAction} columns={2}>
                <Field id="billing-pack-partner" label="Partenaire">
                  <Input {...fieldControlProps("billing-pack-partner")} name="partnerId" placeholder="Identifiant partenaire" />
                </Field>
                <Field id="billing-pack-credits" label="Credits">
                  <Input {...fieldControlProps("billing-pack-credits")} name="credits" type="number" min={1} step={1} defaultValue={10} />
                </Field>
                <Field id="billing-pack-reason" label="Motif">
                  <Input {...fieldControlProps("billing-pack-reason")} name="reason" placeholder="Motif du pack" />
                </Field>
                <Field id="billing-pack-invoice" label="Facture reglee (optionnel)">
                  <Select
                    {...fieldControlProps("billing-pack-invoice")}
                    name="invoiceId"
                    defaultValue=""
                    options={[
                      { value: "", label: "Aucune facture liee" },
                      ...issuedItems
                        .filter((invoice) => invoice.status === "paid" || invoice.status === "partially_paid")
                        .map((invoice) => ({ value: invoice.id, label: `${invoice.number} - ${invoice.customer.legalName}` }))
                    ]}
                  />
                </Field>
                <FormActions>
                  <Button type="submit" variant="secondary">Crediter un pack</Button>
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
      <Grid columns="kpi" as="section" aria-label="Synthese du compte courtier">
        <KpiCard label="Facture TTC" value={xof(account.totals.invoiced)} />
        <KpiCard label="Avoirs" value={xof(account.totals.credited)} />
        <KpiCard label="Paiements constates" value={xof(account.totals.paid)} tone="success" />
        <KpiCard label="Solde du" value={xof(account.totals.balanceDue)} tone={account.totals.balanceDue > 0 ? "warning" : "neutral"} />
        <KpiCard label="Credits pack restants" value={account.packCreditsRemaining} />
      </Grid>
      <Card title="Ecritures du compte">
        <DataTable
          columns={[
            { key: "date", header: "Date", render: (entry) => entry.date.slice(0, 10) },
            { key: "label", header: "Ecriture", render: (entry) => entry.label },
            { key: "reference", header: "Reference", render: (entry) => <code>{entry.reference}</code> },
            { key: "debit", header: "Debit", render: (entry) => (entry.debit ? xof(entry.debit) : "-"), numeric: true, align: "right" },
            { key: "credit", header: "Credit", render: (entry) => (entry.credit ? xof(entry.credit) : "-"), numeric: true, align: "right" },
            { key: "balance", header: "Solde", render: (entry) => xof(entry.balance), numeric: true, align: "right" }
          ]}
          items={account.entries}
          getKey={(entry) => `${entry.kind}-${entry.documentId}`}
          emptyLabel="Aucune ecriture pour ce partenaire."
          aria-label="Ecritures du compte courtier"
        />
        <p>{account.notice}</p>
      </Card>
      <Card title="Attribuer un pack apres paiement constate" description="Le pack est lie a la facture reglee; aucun paiement n'est capture par cette action.">
        <Form action={grantLeadPackAction} columns={2}>
          <input type="hidden" name="partnerId" value={account.partnerId} />
          <input type="hidden" name="returnTab" value="comptes" />
          <Field id="account-pack-invoice" label="Facture reglee">
            <Select
              {...fieldControlProps("account-pack-invoice")}
              name="invoiceId"
              defaultValue=""
              placeholder={settled.length ? "Choisir une facture" : "Aucune facture reglee"}
              options={settled.map((invoice) => ({ value: invoice.id, label: `${invoice.number} - ${xof(invoice.amountPaid)} recus` }))}
            />
          </Field>
          <Field id="account-pack-credits" label="Credits">
            <Input {...fieldControlProps("account-pack-credits")} name="credits" type="number" min={1} step={1} defaultValue={10} />
          </Field>
          <Field id="account-pack-reason" label="Motif">
            <Input {...fieldControlProps("account-pack-reason")} name="reason" placeholder="Pack regle par virement" />
          </Field>
          <FormActions>
            <Button type="submit" variant="secondary">Attribuer le pack</Button>
          </FormActions>
        </Form>
      </Card>
    </>
  );
}
