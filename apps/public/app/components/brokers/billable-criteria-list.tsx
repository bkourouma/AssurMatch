import { Icon } from "../ui/icons";
import type { BillableLeadCriterion } from "../../content/brokers";

export interface BillableCriteriaListProps {
  criteria: readonly BillableLeadCriterion[];
  label: string;
}

/** The seven criteria that make a lead billable (PRD section 24), so a broker sees exactly what is charged. */
export function BillableCriteriaList({ criteria, label }: BillableCriteriaListProps) {
  return (
    <ul className="am-criterialist" aria-label={label}>
      {criteria.map((criterion) => (
        <li className="am-criterialist__item" key={criterion.id}>
          <Icon name="check" size={20} className="am-criterialist__icon" />
          <p className="am-criterialist__text">{criterion.label}</p>
        </li>
      ))}
    </ul>
  );
}
