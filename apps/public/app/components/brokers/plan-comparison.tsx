import type { BrokerPlanContent, BrokerPlanKey } from "../../content/brokers";

export interface PlanComparisonLabels {
  /** Visually hidden header above the plan names column, e.g. "Formule". */
  cornerLabel: string;
  positioning: string;
  audience: string;
  features: string;
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
 * SITE-408: a real `<table>` on desktop, restyled into stacked cards below 680px by
 * `app/styles/brokers.css` (`.am-plans-table-wrap` / `.am-plans-cards`). Both renderings read the
 * same `plans` array, so there is only one source of truth; CSS hides whichever does not fit the
 * viewport rather than picking a rendering in JavaScript, so the page still works with CSS alone.
 */
export function PlanComparison({ plans, labels }: PlanComparisonProps) {
  return (
    <>
      <div className="am-plans-table-wrap">
        <table className="am-plans-table">
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
                    {base ? <p className="am-plans-table__note">{labels.includesPrefix(base.name)}</p> : null}
                    <ul className="am-plans-table__features">
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

      <ul className="am-plans-cards" aria-label={labels.cornerLabel}>
        {plans.map((plan) => {
          const base = findPlan(plans, plan.includesPlan);
          return (
            <li className="am-plancard" key={plan.key}>
              <h3 className="am-plancard__name">{plan.name}</h3>
              <p className="am-plancard__positioning">{plan.positioning}</p>
              <p className="am-plancard__audience">{plan.audience}</p>
              {base ? <p className="am-plans-table__note">{labels.includesPrefix(base.name)}</p> : null}
              <ul className="am-plancard__features">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </>
  );
}
