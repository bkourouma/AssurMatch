import { Button } from "../ui/button";
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from "../ui/card";
import { Icon } from "../ui/icons";
import type { ComponentProps } from "react";
import type { Link } from "../../../i18n/navigation";

export interface PlanPricingLabels {
  monthlySubscription: string;
  perLead: string;
  setupFee: string;
  onRequest: string;
  /** "Non inclus dans cette formule" heading above `notIncluded`. */
  notIncludedTitle: string;
  /** "Envoyer ma candidature" button label. */
  applyCta: string;
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
  /** What this plan does not include (charter content/05: state the limit, not only the promise). */
  notIncluded: readonly string[];
  /** `/brokers/apply?formule=<key>` - preselects the plan on the application form. */
  applyHref: ComponentProps<typeof Link>["href"];
}

/**
 * SITE-409: one plan's business-to-business price, or "sur devis" / "on request" when
 * `GET /partners/plans` has no row for it yet. Pricing here is never the visitor-facing indicative
 * price: it is what the broker itself pays AssurMatch, so it carries no "prix indicatif, à confirmer
 * par le courtier partenaire" mention. The monthly subscription leads with a large tabular figure
 * (the one number a broker scans for first); the per-lead price and the setup fee sit below it as a
 * small key/value list.
 */
export function PlanPricingCard({
  planName,
  positioning,
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
    <Card as="li" {...(highlighted ? { featured: true } : {})}>
      <CardHeader>
        <CardTitle>{planName}</CardTitle>
      </CardHeader>
      <CardBody>
        <p className="am-priceplan__positioning">{positioning}</p>
        {hasPrice ? (
          <>
            <p className="am-priceplan__price">
              <span className="am-priceplan__amount am-tabular">{monthlySubscription}</span>
              <span className="am-priceplan__caption">{labels.monthlySubscription}</span>
            </p>
            <dl className="am-kv" data-columns="1">
              <div>
                <dt>{labels.perLead}</dt>
                <dd className="am-tabular">{perLead}</dd>
              </div>
              <div>
                <dt>{labels.setupFee}</dt>
                <dd className="am-tabular">{setupFee}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="am-priceplan__onrequest">
            <Icon name="clock" size={16} />
            {labels.onRequest}
          </p>
        )}
        {notIncluded.length > 0 ? (
          <div className="am-priceplan__notincluded">
            <p className="am-priceplan__notincludedtitle">{labels.notIncludedTitle}</p>
            <ul>
              {notIncluded.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
      <CardFooter>
        <Button href={applyHref} size="sm" fullWidth>
          {labels.applyCta}
        </Button>
      </CardFooter>
    </Card>
  );
}
