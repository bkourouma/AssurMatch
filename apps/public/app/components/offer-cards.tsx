import type { OfferDetail, OfferSummary } from "../../../../packages/shared/contracts/quote.contracts";

const paymentLabels: Record<string, string> = { annual: "annuel", semiannual: "semestriel", quarterly: "trimestriel", monthly: "mensuel" };
const criterionLabels: Record<string, string> = {
  guaranteeLevel: "Niveau de garantie",
  price: "Prix",
  deductible: "Franchise",
  processingSpeed: "Rapidite de traitement",
  paymentFlexibility: "Flexibilite de paiement",
  informationQuality: "Qualite des informations",
  userPreferences: "Vos preferences"
};

export function formatAmount(value: number | undefined, currency = "XOF"): string {
  if (value === undefined) return "non renseigne";
  return `${new Intl.NumberFormat("fr-FR").format(value)} ${currency}`;
}

export function paymentLabel(value: string | undefined): string {
  return value ? paymentLabels[value] ?? value : "non renseigne";
}

export function ScoreBreakdown({ score }: { score: NonNullable<OfferSummary["score"]> }) {
  return (
    <details>
      <summary>Score indicatif: {score.total}/100</summary>
      <p>{score.label}</p>
      <table>
        <thead>
          <tr><th>Critere</th><th>Poids</th><th>Points</th><th>Explication</th></tr>
        </thead>
        <tbody>
          {score.breakdown.map((line) => (
            <tr key={line.criterion}>
              <td>{criterionLabels[line.criterion] ?? line.criterion}</td>
              <td>{line.weight}%</td>
              <td>{line.points}</td>
              <td>{line.explanation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function OfferCriteria({ offer }: { offer: OfferSummary | OfferDetail }) {
  return (
    <dl>
      <dt>Prix indicatif</dt>
      <dd>{offer.indicativePriceMin !== undefined ? `a partir de ${formatAmount(offer.indicativePriceMin)}` : "prix a confirmer"} ({offer.indicativePriceLabel})</dd>
      <dt>Courtier partenaire responsable</dt>
      <dd>{offer.partnerName ?? offer.brokerName ?? "courtier partenaire"}</dd>
      <dt>Assureur porteur du risque</dt>
      <dd>{offer.insurerName ?? "non renseigne"}</dd>
      <dt>Niveau de garantie</dt>
      <dd>{offer.guaranteeLevel !== undefined ? `${offer.guaranteeLevel}/5` : "non renseigne"}</dd>
      <dt>Franchise</dt>
      <dd>{formatAmount(offer.deductibleAmount)}</dd>
      <dt>Plafond de garantie</dt>
      <dd>{formatAmount(offer.coverageCeiling)}</dd>
      <dt>Delai moyen de traitement</dt>
      <dd>{offer.processingDelayDays !== undefined ? `${offer.processingDelayDays} jour(s)` : "non renseigne"}</dd>
      <dt>Flexibilite de paiement</dt>
      <dd>{paymentLabel(offer.paymentFlexibility)}</dd>
      {offer.guarantees.length > 0 ? (
        <>
          <dt>Garanties</dt>
          <dd>
            <ul>
              {offer.guarantees.map((guarantee) => (
                <li key={guarantee.key}>{guarantee.included ? "Incluse" : "Non incluse"}: {guarantee.label}{guarantee.detail ? ` (${guarantee.detail})` : ""}</li>
              ))}
            </ul>
          </dd>
        </>
      ) : null}
      {offer.updatedAt ? (
        <>
          <dt>Derniere mise a jour</dt>
          <dd>{offer.updatedAt.slice(0, 10)}</dd>
        </>
      ) : null}
    </dl>
  );
}

export function OfferCard({ offer, countryCode, productKey }: { offer: OfferSummary; countryCode: string; productKey: string }) {
  const detailHref = `/offers/${offer.id}?country=${encodeURIComponent(countryCode)}&product=${encodeURIComponent(productKey)}`;
  const quoteHref = `/countries/${encodeURIComponent(countryCode)}/products/${encodeURIComponent(productKey)}/quote?offerId=${offer.id}`;
  return (
    <article aria-label={offer.name}>
      <h2>
        <label>
          <input type="checkbox" name="ids" value={offer.id} form="compare-form" /> {offer.name}
        </label>
        {offer.isSponsored ? <span> - Sponsorise{offer.sponsorLabel ? ` (${offer.sponsorLabel})` : ""}</span> : null}
      </h2>
      {offer.guaranteeSummary ? <p>{offer.guaranteeSummary}</p> : null}
      <OfferCriteria offer={offer} />
      {offer.score ? <ScoreBreakdown score={offer.score} /> : null}
      <p>{offer.disclaimer}</p>
      <nav aria-label={`Actions ${offer.name}`}>
        <a href={detailHref}>Voir le detail</a>
        <a href={quoteHref}>Demander un devis</a>
      </nav>
    </article>
  );
}
