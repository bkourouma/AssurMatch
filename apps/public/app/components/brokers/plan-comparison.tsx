import { Card, CardBody, CardHeader, CardTitle } from "../ui/card";
import { Reveal } from "../motion/reveal";
import type { BrokerPlanContent, BrokerPlanKey } from "../../content/brokers";

export interface PlanComparisonLabels {
  /** Visually hidden header above the plan names column, e.g. "Formule". */
  cornerLabel: string;
  positioning: string;
  audience: string;
  features: string;
  /** Summary text of the collapsible detailed table, e.g. "Comparer les formules en détail". */
  compareDetails: string;
  /** Builds "Everything in {plan}, plus:" from the base plan's name. */
  includesPrefix: (planName: string) => string;
}

export interface PlanComparisonProps {
  plans: readonly BrokerPlanContent[];
  labels: PlanComparisonLabels;
}

function findPlan(plans: readonly BrokerPlanContent[], key: BrokerPlanKey | undefined): BrokerPlanContent | undefined {
  return key ? plans.find((plan) => plan.key === key) : undefined;
}

/**
 * SITE-408: three plan cards (one per `BrokerPlanContent`) are the primary, always-visible rendering
 * at every viewport - the "Pro" plan gets a neutral visual emphasis (`Card featured`: a stronger
 * border and a soft glow) with no "recommended"/"best" claim in the copy. The exhaustive side-by-side
 * table reads the very same `plans` array and lives inside a collapsible `<details>` below the cards,
 * so a visitor who wants the full breakdown can open it without the page showing two renderings of
 * the same data at once.
 */
export function PlanComparison({ plans, labels }: PlanComparisonProps) {
  return (
    <>
      <Reveal as="ul" stagger className="am-pricing-grid">
        {plans.map((plan) => {
          const base = findPlan(plans, plan.includesPlan);
          return (
            <Card as="li" key={plan.key} featured={plan.key === "pro"}>
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="am-plancard__positioning">{plan.positioning}</p>
                <p className="am-plancard__audience">{plan.audience}</p>
                {base ? <p className="am-plan-note">{labels.includesPrefix(base.name)}</p> : null}
                <ul className="am-plancard__features">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          );
        })}
      </Reveal>

      <div className="am-faq">
        <details className="am-faq__item">
          <summary>{labels.compareDetails}</summary>
          <div className="am-faq__answer">
            <div className="am-table-wrap">
              <table className="am-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="am-visually-hidden">{labels.cornerLabel}</span>
                    </th>
                    {plans.map((plan) => (
                      <th scope="col" key={plan.key}>
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">{labels.positioning}</th>
                    {plans.map((plan) => (
                      <td key={plan.key}>{plan.positioning}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">{labels.audience}</th>
                    {plans.map((plan) => (
                      <td key={plan.key}>{plan.audience}</td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">{labels.features}</th>
                    {plans.map((plan) => {
                      const base = findPlan(plans, plan.includesPlan);
                      return (
                        <td key={plan.key}>
                          {base ? <p className="am-comparetable__note">{labels.includesPrefix(base.name)}</p> : null}
                          <ul className="am-comparetable__features">
                            {plan.features.map((feature) => (
                              <li key={feature}>{feature}</li>
                            ))}
                          </ul>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </div>
    </>
  );
}
