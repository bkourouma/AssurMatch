export interface PlanPricingLabels {
  monthlySubscription: string;
  perLead: string;
  setupFee: string;
  onRequest: string;
}

export interface PlanPricingCardProps {
  planName: string;
  positioning: string;
  labels: PlanPricingLabels;
  /** Formatted money strings (already localised to the country's currency), or `undefined` when the
   * API has no published price for this plan/country - never a number invented on the public site. */
  monthlySubscription?: string;
  perLead?: string;
  setupFee?: string;
  highlighted?: boolean;
}

/**
 * SITE-409: one plan's business-to-business price, or "sur devis" / "on request" when
 * `GET /partners/plans` has no row for it yet. Pricing here is never the visitor-facing indicative
 * price: it is what the broker itself pays AssurMatch, so it carries no "prix indicatif, à confirmer
 * par le courtier partenaire" mention.
 */
export function PlanPricingCard({ planName, positioning, labels, monthlySubscription, perLead, setupFee, highlighted }: PlanPricingCardProps) {
  const hasPrice = monthlySubscription !== undefined;
  return (
    <div className="pub-card" data-tone={highlighted ? "brand" : undefined}>
      <h3 className="pub-card__title">{planName}</h3>
      <p className="pub-meta">{positioning}</p>
      {hasPrice ? (
        <dl className="am-kv">
          <div>
            <dt>{labels.monthlySubscription}</dt>
            <dd>{monthlySubscription}</dd>
          </div>
          <div>
            <dt>{labels.perLead}</dt>
            <dd>{perLead}</dd>
          </div>
          <div>
            <dt>{labels.setupFee}</dt>
            <dd>{setupFee}</dd>
          </div>
        </dl>
      ) : (
        <p className="am-broker__name">{labels.onRequest}</p>
      )}
    </div>
  );
}
