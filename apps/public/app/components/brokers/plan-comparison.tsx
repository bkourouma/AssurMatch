import { PlanFeatureList } from "./plan-feature-list";
import type { BrokerPlanContent, BrokerPlanKey } from "../../content/brokers";

export interface PlanComparisonLabels {
  /** Visually hidden header above the row labels column, e.g. "Formule". */
  cornerLabel: string;
  positioning: string;
  audience: string;
  features: string;
  /** Builds "Tout {plan}, plus :" from the base plan's name. */
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
 * SITE-408: the three plans side by side. From 900px it is one `.am-table` (a row per criterion, a
 * column per plan), the only rendering shown. Below 900px a three-column table cannot be read, so the
 * same `plans` array renders as a ruled list of native `<details>`: the plan name and its positioning
 * stay visible, the audience and the features open on a tap, with no script. CSS shows exactly one of
 * the two renderings at any width (`display: none` also hides the other from assistive technology).
 * No plan is called "recommended": the content makes no such claim.
 */
export function PlanComparison({ plans, labels }: PlanComparisonProps) {
  return (
    <div className="am-plancompare">
      <div className="am-plancompare__wide am-table-wrap">
        <table className="am-table am-plancompare__table">
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
                    {base ? <p className="am-plancompare__includes">{labels.includesPrefix(base.name)}</p> : null}
                    <PlanFeatureList items={plan.features} />
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="am-plancompare__narrow am-faq">
        {plans.map((plan) => {
          const base = findPlan(plans, plan.includesPlan);
          return (
            <details className="am-faq__item am-plancompare__plan" key={plan.key}>
              <summary>
                <span className="am-plancompare__summary">
                  <span className="am-plancompare__name">{plan.name}</span>
                  <span className="am-plancompare__positioning">{plan.positioning}</span>
                </span>
              </summary>
              <div className="am-plancompare__detail">
                <dl className="am-plancompare__facts">
                  <div>
                    <dt>{labels.audience}</dt>
                    <dd>{plan.audience}</dd>
                  </div>
                </dl>
                <p className="am-plancompare__label">{labels.features}</p>
                {base ? <p className="am-plancompare__includes">{labels.includesPrefix(base.name)}</p> : null}
                <PlanFeatureList items={plan.features} />
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
