import { readBillingFoundation, readBillingPlans, readDraftInvoices, readLeadPacks } from "../lib/admin-api";
import { grantLeadPackAction, recomputeDraftInvoicesAction, upsertBillingPlanAction } from "../lib/billing-actions";
import { Badge, Card, DataTable, KpiCard, PageHeader, StateMessage } from "../lib/ui/admin-ui";

const BILLING_NOTICES: Record<string, string> = {
  plan_saved: "Tarif de plan enregistre et audite.",
  drafts_computed: "Brouillons recalcules. Aucun encaissement et aucune emission de facture.",
  pack_granted: "Pack de leads credite au partenaire (aucun paiement encaisse).",
  disabled: "Module billing desactive: activez billing_enabled par la procedure de conformite.",
  forbidden: "Action refusee: role Finance Admin ou Super Admin requis.",
  invalid: "Saisie incomplete: verifiez le plan, le pays et le motif.",
  error: "Billing temporairement indisponible."
};

export default async function BillingFoundationPage({ searchParams }: { searchParams: Promise<{ billing?: string }> }) {
  const { billing: notice } = await searchParams;
  const [billing, plans, drafts, packs] = await Promise.all([readBillingFoundation(), readBillingPlans(), readDraftInvoices(), readLeadPacks()]);

  return (
    <div className="page-stack">
      <PageHeader
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
          <section className="admin-grid admin-grid--kpi" aria-label="Synthese billing foundation">
            <KpiCard label="Partenaires suivis" value={billing.data.totals.partners} />
            <KpiCard label="Leads acceptes (brouillon)" value={billing.data.totals.acceptedLeadCount} tone="info" />
            <KpiCard label="Leads contestes" value={billing.data.totals.disputedLeadCount} tone="warning" />
          </section>

          <section className="admin-grid admin-grid--two">
            <Card>
              <h2 className="section-title">Etat module</h2>
              <div className="admin-grid">
                <Badge tone={billing.data.billingEnabled ? "warning" : "disabled"}>billing_enabled: {billing.data.billingEnabled ? "actif" : "desactive"}</Badge>
                <Badge tone="disabled">payments_enabled: desactive</Badge>
                <Badge tone="disabled">collection: desactivee</Badge>
              </div>
            </Card>
            <Card>
              <h2 className="section-title">Restrictions</h2>
              <ul className="simple-list">
                {billing.data.restrictions.map((restriction) => <li key={restriction}>{restriction}</li>)}
              </ul>
            </Card>
          </section>

          <Card>
            <DataTable
              columns={[
                { header: "Partenaire", render: (partner) => <strong>{partner.partnerName}</strong> },
                { header: "Plan", render: (partner) => partner.plan },
                { header: "Leads acceptes", render: (partner) => partner.acceptedLeadCount },
                { header: "Contestes", render: (partner) => partner.disputedLeadCount },
                { header: "Reference non facturable", render: (partner) => <code>{partner.draftNonBillableReference}</code> },
                { header: "Statut", render: (partner) => <Badge tone="disabled">{partner.invoiceStatus}</Badge> }
              ]}
              items={billing.data.partners}
              getKey={(partner) => partner.partnerId}
              emptyLabel="Aucun partenaire dans la periode courante."
            />
          </Card>

          <Card>
            <h2 className="section-title">Tarifs par plan et pays</h2>
            <p className="page-description">
              Les tarifs alimentent uniquement les brouillons internes: aucune facture n'est emise et aucune prime n'est collectee par AssurMatch.
            </p>
            <DataTable
              columns={[
                { header: "Plan", render: (price) => price.plan },
                { header: "Pays", render: (price) => price.countryCode },
                { header: "Abonnement mensuel", render: (price) => `${price.monthlySubscription} ${price.currency}` },
                { header: "Prix par lead", render: (price) => `${price.perLeadPrice} ${price.currency}` },
                { header: "Frais d'installation", render: (price) => `${price.setupFee} ${price.currency}` }
              ]}
              items={plans.status === "success" ? plans.data : []}
              getKey={(price) => price.id}
              emptyLabel="Aucun tarif defini."
            />
            <form action={upsertBillingPlanAction} className="admin-grid">
              <label>Plan
                <select name="plan" defaultValue="pro">
                  <option value="starter">starter</option>
                  <option value="pro">pro</option>
                  <option value="enterprise">enterprise</option>
                </select>
              </label>
              <label>Pays (ISO)<input name="countryCode" maxLength={2} placeholder="CI" /></label>
              <label>Abonnement mensuel<input name="monthlySubscription" type="number" min={0} step={100} defaultValue={0} /></label>
              <label>Prix par lead<input name="perLeadPrice" type="number" min={0} step={100} defaultValue={0} /></label>
              <label>Frais d'installation<input name="setupFee" type="number" min={0} step={100} defaultValue={0} /></label>
              <label>Motif<input name="reason" placeholder="Motif du changement de tarif" /></label>
              <button type="submit" className="button button--secondary">Enregistrer le tarif</button>
            </form>
          </Card>

          <Card>
            <h2 className="section-title">Brouillons mensuels non facturables</h2>
            <DataTable
              columns={[
                { header: "Partenaire", render: (draft) => <strong>{draft.partnerName}</strong> },
                { header: "Reference", render: (draft) => <code>{draft.reference}</code> },
                { header: "Leads factures", render: (draft) => draft.billableLeadCount },
                { header: "Non facturables", render: (draft) => draft.nonBillableLeadCount },
                { header: "Credits pack", render: (draft) => draft.packCreditsUsed },
                { header: "Contestations creditees", render: (draft) => draft.disputeCreditCount },
                { header: "Total brouillon", render: (draft) => `${draft.totalAmount} ${draft.currency}` },
                { header: "Statut", render: (draft) => <Badge tone="disabled">{draft.status}</Badge> }
              ]}
              items={drafts.status === "success" ? drafts.data.items : []}
              getKey={(draft) => draft.id}
              emptyLabel="Aucun brouillon calcule."
            />
            <form action={recomputeDraftInvoicesAction} className="admin-grid">
              <label>Partenaire (optionnel)<input name="partnerId" placeholder="Identifiant partenaire" /></label>
              <label>Motif<input name="reason" placeholder="Motif du recalcul" /></label>
              <button type="submit" className="button button--secondary">Recalculer les brouillons</button>
            </form>
          </Card>

          <Card>
            <h2 className="section-title">Packs de leads prepayes</h2>
            <DataTable
              columns={[
                { header: "Partenaire", render: (pack) => <code>{pack.partnerId}</code> },
                { header: "Credits", render: (pack) => pack.creditsGranted },
                { header: "Consommes", render: (pack) => pack.creditsConsumed },
                { header: "Restants", render: (pack) => pack.creditsRemaining },
                { header: "Motif", render: (pack) => pack.reason }
              ]}
              items={packs.status === "success" ? packs.data : []}
              getKey={(pack) => pack.id}
              emptyLabel="Aucun pack accorde."
            />
            <form action={grantLeadPackAction} className="admin-grid">
              <label>Partenaire<input name="partnerId" placeholder="Identifiant partenaire" /></label>
              <label>Credits<input name="credits" type="number" min={1} step={1} defaultValue={10} /></label>
              <label>Motif<input name="reason" placeholder="Motif du pack" /></label>
              <button type="submit" className="button button--secondary">Crediter un pack</button>
            </form>
          </Card>
        </>
      ) : null}
    </div>
  );
}
