import { readAdminOffers, readScoringRules } from "../lib/admin-api";
import { Badge, Card, DataTable, KpiCard, PageHeader, StateMessage } from "../lib/ui/admin-ui";
import { CreateScoringRuleForm, OfferDecisionForm, UpdateScoringRuleForm } from "./scoring-forms";

function weightsLabel(weights: Record<string, number>): string {
  return `garantie ${weights.guaranteeLevel} / prix ${weights.price} / franchise ${weights.deductible} / delai ${weights.processingSpeed} / paiement ${weights.paymentFlexibility} / infos ${weights.informationQuality} / preferences ${weights.userPreferences}`;
}

export default async function ScoringPage() {
  const [rules, offers] = await Promise.all([readScoringRules(), readAdminOffers()]);

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Comparateur public"
        title="Score indicatif et offres"
        description="Ponderation configurable et auditee du score indicatif (PRD §15). Le score est explicable ligne par ligne et ne designe jamais une meilleure offre; la sponsorisation reste signalee."
      />

      {rules.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {rules.forbidden ? <StateMessage tone="danger">Acces scoring refuse pour ce role admin.</StateMessage> : null}
      {rules.status === "error" ? <StateMessage tone="danger">Regles indisponibles: {rules.error}</StateMessage> : null}

      {rules.status === "success" ? (
        <>
          <section className="admin-grid admin-grid--kpi" aria-label="Synthese scoring">
            <KpiCard label="Regles actives" value={rules.data.items.filter((rule) => rule.status === "active").length} tone="success" />
            <KpiCard label="Poids par defaut" value="30/25/15/10/10/5/5" helper="garantie / prix / franchise / delai / paiement / infos / preferences" />
            <KpiCard label="Offres en catalogue" value={offers.status === "success" ? offers.data.length : "-"} tone="info" />
          </section>

          <Card>
            <h2 className="section-title">Regles de scoring</h2>
            <DataTable
              columns={[
                { header: "Pays", render: (rule) => (rule.countryId ? <code>{rule.countryId.slice(0, 8)}</code> : "Tous") },
                { header: "Produit", render: (rule) => (rule.productId ? <code>{rule.productId.slice(0, 8)}</code> : "Tous") },
                { header: "Poids", render: (rule) => weightsLabel(rule.weights) },
                { header: "Statut", render: (rule) => <Badge tone={rule.status === "active" ? "success" : "disabled"}>{rule.status}</Badge> },
                { header: "Version", render: (rule) => rule.version },
                { header: "Identifiant", render: (rule) => <code>{rule.id}</code> }
              ]}
              items={rules.data.items}
              getKey={(rule) => rule.id}
              emptyLabel="Aucune regle: les poids par defaut du PRD s'appliquent."
            />
          </Card>

          <section className="admin-grid admin-grid--two">
            <CreateScoringRuleForm defaults={rules.data.defaults} />
            <UpdateScoringRuleForm ruleIds={rules.data.items.map((rule) => rule.id)} />
          </section>

          <Card>
            <h2 className="section-title">Offres indicatives: validation et suspension</h2>
            <p className="page-description">Une offre n'est publique qu'apres validation admin (OFFER-007); une suspension la retire immediatement du comparateur.</p>
            {offers.status === "forbidden" ? <StateMessage tone="warning">Liste des offres non accessible pour ce role.</StateMessage> : null}
            <DataTable
              columns={[
                { header: "Offre", render: (offer) => offer.name },
                { header: "Statut", render: (offer) => <Badge tone={offer.status === "active" ? "success" : offer.status === "suspended" ? "danger" : "warning"}>{offer.status}</Badge> },
                { header: "Validation", render: (offer) => offer.validationStatus },
                { header: "Sponsorisee", render: (offer) => (offer.isSponsored ? "oui" : "non") },
                { header: "Garantie", render: (offer) => (offer.guaranteeLevel !== undefined ? `${offer.guaranteeLevel}/5` : "-") },
                { header: "Validite", render: (offer) => String(offer.validUntil).slice(0, 10) },
                { header: "Decision", render: (offer) => <OfferDecisionForm offerId={offer.id} offerName={offer.name} /> }
              ]}
              items={offers.data}
              getKey={(offer) => offer.id}
              emptyLabel="Aucune offre en catalogue."
            />
          </Card>

          <StateMessage>Les criteres detailles des offres (garanties, franchise, plafond, delai, assureur) sont saisis via l'API admin des offres; ils alimentent les filtres et le score indicatif du comparateur public.</StateMessage>
        </>
      ) : null}
    </div>
  );
}
