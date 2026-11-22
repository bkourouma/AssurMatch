import { readAdminCountries, readAdminOffers, readAdminProducts, readScoringRules, type AdminOfferData } from "../lib/admin-api";
import {
  Card,
  DataTable,
  Grid,
  PageHeader,
  PageStack,
  StateMessage,
  StatStrip,
  StatusBadge,
  offerStatusTones,
  ruleStatusTones
} from "../lib/ui/admin-ui";
import { CreateScoringRuleForm, OfferDecisionForm, UpdateScoringRuleForm } from "./scoring-forms";
import { readFailureDetail } from "../lib/auth-error-messages";

function offerLabel(offer: AdminOfferData): string {
  return offer.published?.content.name ?? offer.pending?.content.name ?? offer.publicKey;
}

function weightsLabel(weights: Record<string, number>): string {
  return `garantie ${weights.guaranteeLevel} / prix ${weights.price} / franchise ${weights.deductible} / délai ${weights.processingSpeed} / paiement ${weights.paymentFlexibility} / infos ${weights.informationQuality} / préférences ${weights.userPreferences}`;
}

export default async function ScoringPage() {
  const [rules, offers, countries, products] = await Promise.all([readScoringRules(), readAdminOffers(), readAdminCountries(), readAdminProducts()]);
  // Human names for the identifiers; when a list cannot be read the short identifier is shown instead.
  const countryList = countries.status === "success" ? countries.data : [];
  const productList = products.status === "success" ? products.data : [];
  const countryName = (id: string | null) => {
    if (!id) return "Tous les pays";
    const country = countryList.find((candidate) => candidate.id === id);
    return country ? `${country.isoCode} - ${country.name}` : id.slice(0, 8);
  };
  const productName = (id: string | null) => {
    if (!id) return "Tous les produits";
    return productList.find((candidate) => candidate.id === id)?.name ?? id.slice(0, 8);
  };
  // Active rules first, so the ones that currently weight the score are read before the disabled ones.
  const orderedRules = [...rules.data.items].sort((left, right) => Number(right.status === "active") - Number(left.status === "active"));
  const ruleOptions = orderedRules.map((rule) => ({
    id: rule.id,
    label: `${countryName(rule.countryId)} / ${productName(rule.productId)} - v${rule.version}${rule.status === "active" ? "" : " (désactivée)"}`
  }));

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue" }, { label: "Scoring" }]}
        title="Score indicatif et offres"
        description="Pondération auditée du score indicatif (PRD §15). Le score est explicable ligne par ligne et ne désigne jamais une meilleure offre; la sponsorisation reste signalée."
      />

      {rules.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {rules.forbidden ? <StateMessage tone="danger">Accès scoring refusé pour ce rôle admin.</StateMessage> : null}
      {rules.status === "error" ? <StateMessage tone="danger">Règles indisponibles. {readFailureDetail(rules.error)}</StateMessage> : null}

      {rules.status === "success" ? (
        <>
          <StatStrip
            label="Synthèse scoring"
            items={[
              { label: "Règles actives", value: rules.data.items.filter((rule) => rule.status === "active").length, tone: "success" },
              { label: "Poids par défaut", value: "30/25/15/10/10/5/5", helper: "garantie / prix / franchise / délai / paiement / infos / préférences" },
              { label: "Offres en catalogue", value: offers.status === "success" ? offers.data.length : "-", href: "/offers" }
            ]}
          />

          <Card title="Règles de scoring" description="Les règles actives sont listées en premier. Pour modifier ou désactiver une règle, utilisez « Mettre à jour une règle » plus bas.">
            <DataTable
              columns={[
                { key: "country", header: "Pays", render: (rule) => countryName(rule.countryId) },
                { key: "product", header: "Produit", render: (rule) => productName(rule.productId) },
                { key: "weights", header: "Poids", render: (rule) => weightsLabel(rule.weights) },
                { key: "status", header: "Statut", render: (rule) => <StatusBadge status={rule.status} tones={ruleStatusTones} /> },
                { key: "version", header: "Version", render: (rule) => rule.version, numeric: true, align: "right" },
                { key: "id", header: "Identifiant", render: (rule) => <span className="bo-ref">{rule.id}</span> }
              ]}
              items={orderedRules}
              getKey={(rule) => rule.id}
              dense
              emptyLabel="Aucune règle: les poids par défaut du PRD s'appliquent."
              aria-label="Règles de scoring"
            />
          </Card>

          <Grid columns="two">
            <CreateScoringRuleForm
              defaults={rules.data.defaults}
              countries={countryList.map((country) => ({ value: country.id, label: `${country.isoCode} - ${country.name}` }))}
              products={productList.map((product) => ({ value: product.id, label: product.name }))}
            />
            <UpdateScoringRuleForm rules={ruleOptions} />
          </Grid>

          <Card
            title="Offres indicatives: validation et suspension"
            description="Une offre n'est publique qu'après validation admin (OFFER-007); une suspension la retire immédiatement du comparateur."
          >
            {offers.status === "forbidden" ? <StateMessage tone="warning">Liste des offres non accessible pour ce rôle.</StateMessage> : null}
            <DataTable
              columns={[
                { key: "name", header: "Offre", render: (offer) => <a href={`/offers/${encodeURIComponent(offer.id)}`}>{offerLabel(offer)}</a> },
                { key: "status", header: "Statut", render: (offer) => <StatusBadge status={offer.status} tones={offerStatusTones} /> },
                { key: "validation", header: "Version en cours", render: (offer) => (offer.pending ? `v${offer.pending.versionNumber} ${offer.pending.status}` : "-") },
                { key: "sponsored", header: "Sponsorisée", render: (offer) => (offer.isSponsored ? "oui" : "non") },
                { key: "guarantee", header: "Garantie", render: (offer) => (offer.published?.content.guaranteeLevel !== undefined ? `${offer.published.content.guaranteeLevel}/5` : "-") },
                { key: "validUntil", header: "Validité", render: (offer) => (offer.expiresAt ? offer.expiresAt.slice(0, 10) : "-") },
                { key: "decision", header: "Décision", render: (offer) => <OfferDecisionForm offerId={offer.id} offerName={offerLabel(offer)} /> }
              ]}
              items={offers.data}
              getKey={(offer) => offer.id}
              emptyLabel="Aucune offre en catalogue."
              aria-label="Offres indicatives"
            />
            <p className="bo-description">Les critères détaillés des offres (garanties, franchise, plafond, délai, assureur) sont saisis via l'API admin des offres; ils alimentent les filtres et le score indicatif du comparateur public.</p>
          </Card>
        </>
      ) : null}
    </PageStack>
  );
}
