import { readBillingFoundation, readBillingPlans, readDraftInvoices, readLeadPacks } from "../lib/admin-api";
import { grantLeadPackAction, recomputeDraftInvoicesAction, upsertBillingPlanAction } from "../lib/billing-actions";
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
import type { DraftInvoiceData } from "../lib/admin-api";

const BILLING_NOTICES: Record<string, string> = {
  plan_saved: "Tarif de plan enregistre et audite.",
  drafts_computed: "Brouillons recalcules. Aucun encaissement et aucune emission de facture.",
  pack_granted: "Pack de leads credite au partenaire (aucun paiement encaisse).",
  disabled: "Module billing desactive: activez billing_enabled par la procedure de conformite.",
  forbidden: "Action refusee: role Finance Admin ou Super Admin requis.",
  invalid: "Saisie incomplete: verifiez le plan, le pays et le motif.",
  error: "Billing temporairement indisponible."
};

const TABS = [
  { key: "suivi", label: "Suivi partenaires" },
  { key: "tarifs", label: "Tarifs" },
  { key: "brouillons", label: "Brouillons" },
  { key: "packs", label: "Packs" }
];

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
  const [billing, plans, drafts, packs] = await Promise.all([readBillingFoundation(), readBillingPlans(), readDraftInvoices(), readLeadPacks()]);

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
        kicker="Fondation billing"
        title="Billing sans paiements"
        description="Vue finance lecture seule des compteurs de leads qualifies et brouillons non facturables. Aucun encaissement, prime, paiement ou emission de facture n'est active."
      />

      {billing.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {billing.forbidden ? <StateMessage tone="danger">Acces billing refuse pour ce role admin.</StateMessage> : null}
      {billing.status === "error" ? <StateMessage tone="danger">Billing indisponible: {billing.error}</StateMessage> : null}
      {notice && BILLING_NOTICES[notice] ? <StateMessage tone={notice === "plan_saved" || notice === "drafts_computed" || notice === "pack_granted" ? "info" : "warning"}>{BILLING_NOTICES[notice]}</StateMessage> : null}

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
              description="Les tarifs alimentent uniquement les brouillons internes: aucune facture n'est emise et aucune prime n'est collectee par AssurMatch."
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

          {tab === "packs" ? (
            <Card title="Packs de leads prepayes">
              <DataTable
                columns={[
                  { key: "partner", header: "Partenaire", render: (pack) => <code>{pack.partnerId}</code> },
                  { key: "granted", header: "Credits", render: (pack) => pack.creditsGranted, numeric: true, align: "right" },
                  { key: "consumed", header: "Consommes", render: (pack) => pack.creditsConsumed, numeric: true, align: "right" },
                  { key: "remaining", header: "Restants", render: (pack) => pack.creditsRemaining, numeric: true, align: "right" },
                  { key: "reason", header: "Motif", render: (pack) => pack.reason }
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
