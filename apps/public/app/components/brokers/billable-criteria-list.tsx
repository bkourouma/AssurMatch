import { Card } from "../ui/card";
import { IconTile } from "../ui/icon-tile";
import { Reveal } from "../motion/reveal";
import type { BillableLeadCriterion } from "../../content/brokers";

export interface BillableCriteriaListProps {
  criteria: readonly BillableLeadCriterion[];
}

/**
 * The seven criteria that make a lead billable (PRD section 24), so a broker sees exactly what is
 * charged. Green is used here exactly as the design system allows it: a validation tick, never a
 * background or a button.
 */
export function BillableCriteriaList({ criteria }: BillableCriteriaListProps) {
  return (
    <Reveal as="ul" stagger className="am-criterialist">
      {criteria.map((criterion) => (
        <Card as="li" key={criterion.id} padding="sm" className="am-criterialist__item">
          <IconTile name="check" tone="success" size="sm" />
          <p className="am-criterialist__text">{criterion.label}</p>
        </Card>
      ))}
    </Reveal>
  );
}
