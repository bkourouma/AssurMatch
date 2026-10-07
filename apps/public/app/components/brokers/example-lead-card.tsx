import { Badge } from "../ui/badge";
import { Icon } from "../ui/icons";
import { Pictogram } from "../ui/pictogram";

export interface LeadExampleField {
  label: string;
  value: string;
}

export interface LeadExampleCardProps {
  /** "Exemple illustratif" / "Illustrative example": the visible label and the group's accessible name. */
  badgeLabel: string;
  disclaimer: string;
  reference: LeadExampleField;
  country: LeadExampleField;
  product: LeadExampleField;
  city: LeadExampleField;
  budget: LeadExampleField;
  channel: LeadExampleField;
  consent: LeadExampleField;
}

/**
 * What a broker receives when a lead is assigned, shown as one plain example record: a dashed
 * outline (nothing on it is real), the « Exemple illustratif » label on top, the fields as a
 * definition list, the disclaimer at the bottom. It is not a picture of an application screen.
 *
 * It never carries a name, a phone number or an e-mail: those are personal data the platform only
 * ever transmits to the assigned partner broker, never displayed as sample content on the public site.
 */
export function LeadExampleCard({ badgeLabel, disclaimer, reference, country, product, city, budget, channel, consent }: LeadExampleCardProps) {
  return (
    <div className="am-leadexample" role="group" aria-label={badgeLabel}>
      <div className="am-leadexample__head">
        <Badge tone="neutral" size="lg">
          {badgeLabel}
        </Badge>
      </div>

      <dl className="am-leadexample__fields">
        <div>
          <dt>{reference.label}</dt>
          <dd className="am-tabular">{reference.value}</dd>
        </div>
        <div>
          <dt>{country.label}</dt>
          <dd>{country.value}</dd>
        </div>
        <div>
          <dt>{product.label}</dt>
          <dd className="am-leadexample__withicon">
            <Pictogram name="auto" size={20} />
            {product.value}
          </dd>
        </div>
        <div>
          <dt>{city.label}</dt>
          <dd>{city.value}</dd>
        </div>
        <div>
          <dt>{budget.label}</dt>
          <dd className="am-tabular">{budget.value}</dd>
        </div>
        <div>
          <dt>{channel.label}</dt>
          <dd className="am-leadexample__withicon">
            <Icon name="whatsapp" size={20} />
            {channel.value}
          </dd>
        </div>
        <div>
          <dt>{consent.label}</dt>
          <dd>
            {/* Recorded consent is a confirmed state: the one green mark of the record. */}
            <Badge tone="approved" icon={<Icon name="check" size={16} />}>
              {consent.value}
            </Badge>
          </dd>
        </div>
      </dl>

      <p className="am-leadexample__disclaimer">{disclaimer}</p>
    </div>
  );
}
