import { Icon } from "../ui/icons";
import type { BillableLeadCriterion } from "../../content/brokers";

export interface BillableCriteriaListProps {
  criteria: readonly BillableLeadCriterion[];
}

/**
 * The seven criteria that make a lead billable (PRD section 24), so a broker sees exactly what is
 * charged. A ruled list with navy ticks: these are conditions a lead must meet, not something
 * confirmed, so the green of the palette stays out of it.
 */
export function BillableCriteriaList({ criteria }: BillableCriteriaListProps) {
  return (
    <ul className="am-brokerlist am-criterialist">
      {criteria.map((criterion) => (
        <li key={criterion.id} data-criterion={criterion.id}>
          <Icon name="check" size={20} />
          <span>{criterion.label}</span>
        </li>
      ))}
    </ul>
  );
}
