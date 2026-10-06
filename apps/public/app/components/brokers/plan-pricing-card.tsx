import type { ComponentProps } from "react";
import type { Link } from "../../../i18n/navigation";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { PlanFeatureList } from "./plan-feature-list";

export interface PlanPricingLabels {
  monthlySubscription: string;
  perLead: string;
  setupFee: string;
  onRequest: string;
  /** "Non inclus dans cette formule" heading above `notIncluded`. */
  notIncludedTitle: string;
  /** "Envoyer ma candidature" button label. */
  applyCta: string;
  /** "Public visé". */
  audience: string;
  /** "Fonctionnalités" heading above `features`. */
  featuresTitle: string;
}

export interface PlanPricingCardProps {
  planName: string;
  positioning: string;
  /** Who the plan is for. */
  audience: string;
  /** The plan's own features, word for word from `content/brokers.ts`. */
  features: readonly string[];
  /** "Tout Starter, plus :" when the plan builds on another one. */
  includesNote?: string;
  labels: PlanPricingLabels;
  /** Formatted money strings (already localised to the country's currency), or `undefined` when the
   * API has no published price for this plan/country - never a number invented on the public site. */
  monthlySubscription?: string;
  perLead?: string;
  setupFee?: string;
  /** The plan marked by a 2px navy outline (`Card featured`), with no "recommended" claim. */
  highlighted?: boolean;
  /** What this plan does not include (charter content/05: state the limit, not only the promise). */
  notIncluded: readonly string[];
  /** `/brokers/apply?formule=<key>` - preselects the plan on the application form. */
  applyHref: ComponentProps<typeof Link>["href"];
}

/**
 * SITE-409: one plan panel. Every panel has the same five parts in the same order (who it is for,
 * price, action, features, exclusions), so that the parts line up across the three panels on a wide
 * screen (see the subgrid in `styles/brokers.css`).
 *
 * The price is what the broker pays AssurMatch, not an insurance price, so it carries no "prix
 * indicatif, à confirmer par le courtier partenaire" mention; the page states instead, next to the
 * panels, that these prices are indicative, excluding tax and specific to each country. When
 * `GET /partners/plans` has no row for the plan, the panel says "Sur devis" inside a dashed outline:
 * nothing is confirmed there yet.
 */
export function PlanPricingCard({
  planName,
  positioning,
  audience,
  features,
  includesNote,
  labels,
  monthlySubscription,
  perLead,
  setupFee,
  highlighted,
  notIncluded,
  applyHref
}: PlanPricingCardProps) {
  const hasPrice = monthlySubscription !== undefined;
  return (
    <Card as="li" className="am-planpanel" {...(highlighted ? { featured: true } : {})}>
      <div className="am-planpanel__head">
        <h3 className="am-planpanel__name">{planName}</h3>
        <p className="am-planpanel__positioning">{positioning}</p>
        <dl className="am-planpanel__audience">
          <dt>{labels.audience}</dt>
          <dd>{audience}</dd>
        </dl>
      </div>

      {hasPrice ? (
        <div className="am-planpanel__price">
          <p className="am-planpanel__amount">
            <span className="am-tabular">{monthlySubscription}</span>
            <span className="am-planpanel__per">{labels.monthlySubscription}</span>
          </p>
          <dl className="am-planpanel__fees">
            <div>
              <dt>{labels.perLead}</dt>
              <dd className="am-tabular">{perLead}</dd>
            </div>
            <div>
              <dt>{labels.setupFee}</dt>
              <dd className="am-tabular">{setupFee}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="am-planpanel__price">
          <p className="am-planpanel__onrequest">{labels.onRequest}</p>
        </div>
      )}

      <div className="am-planpanel__action">
        <Button href={applyHref} fullWidth>
          {labels.applyCta}
        </Button>
      </div>

      <div className="am-planpanel__features">
        <p className="am-planpanel__label">{labels.featuresTitle}</p>
        {includesNote ? <p className="am-planpanel__includes">{includesNote}</p> : null}
        <PlanFeatureList items={features} />
      </div>

      {notIncluded.length > 0 ? (
        <div className="am-planpanel__excluded">
          <p className="am-planpanel__label">{labels.notIncludedTitle}</p>
          <PlanFeatureList items={notIncluded} tone="excluded" />
        </div>
      ) : null}
    </Card>
  );
}
