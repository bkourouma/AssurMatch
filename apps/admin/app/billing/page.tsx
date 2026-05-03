import { readBillingFoundation } from "../lib/admin-api";
import { Badge, Card, DataTable, KpiCard, PageHeader, StateMessage } from "../lib/ui/admin-ui";

export default async function BillingFoundationPage() {
  const billing = await readBillingFoundation();

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
        </>
      ) : null}
    </div>
  );
}
