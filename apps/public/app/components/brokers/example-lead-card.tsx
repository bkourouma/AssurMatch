import { Badge } from "../ui/badge";
import { Icon } from "../ui/icons";
import { IconTile } from "../ui/icon-tile";

export interface LeadExampleField {
  label: string;
  value: string;
}

export interface LeadExampleCardProps {
  /** "Exemple illustratif" / "Illustrative example" - both the ribbon and the group's accessible name. */
  badgeLabel: string;
  disclaimer: string;
  reference: LeadExampleField;
  /** Emoji flag of the illustrative country (e.g. "🇨🇮"), purely decorative. */
  countryFlag: string;
  country: LeadExampleField;
  product: LeadExampleField;
  city: LeadExampleField;
  budget: LeadExampleField;
  channel: LeadExampleField;
  consent: LeadExampleField;
}

/**
 * What a broker receives when a lead is assigned, shown as a realistic-looking ticket built entirely
 * from fictitious example content. Deliberately never carries a name, a phone number or an e-mail:
 * those are personal data the platform only ever transmits to the assigned partner broker, never
 * displayed as sample content on the public site.
 */
export function LeadExampleCard({ badgeLabel, disclaimer, reference, countryFlag, country, product, city, budget, channel, consent }: LeadExampleCardProps) {
  return (
    <div className="am-leadticket" role="group" aria-label={badgeLabel}>
      <span className="am-leadticket__ribbon" aria-hidden="true">
        {badgeLabel}
      </span>

      <div className="am-leadticket__head">
        <IconTile name="car" tone="brand" />
        <div>
          <p className="am-leadticket__product">{product.value}</p>
          <p className="am-leadticket__reference am-tabular">{reference.value}</p>
        </div>
        <span className="am-leadticket__flag" aria-hidden="true">
          {countryFlag}
        </span>
      </div>

      <dl className="am-kv am-leadticket__meta">
        <div>
          <dt>{country.label}</dt>
          <dd>{country.value}</dd>
        </div>
        <div>
          <dt>{city.label}</dt>
          <dd>{city.value}</dd>
        </div>
        <div>
          <dt>{budget.label}</dt>
          <dd className="am-tabular">{budget.value}</dd>
        </div>
      </dl>

      <p className="am-leadticket__channel">
        <Icon name="whatsapp" size={20} />
        {channel.value}
      </p>

      <div className="am-leadticket__foot">
        <Badge tone="approved" icon={<Icon name="check" size={16} />}>
          {consent.value}
        </Badge>
        <p className="am-leadticket__disclaimer">{disclaimer}</p>
      </div>
    </div>
  );
}
