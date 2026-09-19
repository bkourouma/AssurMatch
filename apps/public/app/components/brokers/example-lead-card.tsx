export interface LeadExampleField {
  label: string;
  value: string;
}

export interface LeadExampleCardProps {
  /** "Exemple illustratif" / "Illustrative example" - both the visible badge and the group label. */
  badgeLabel: string;
  fields: readonly LeadExampleField[];
}

/**
 * What a broker receives when a lead is assigned, shown as a fictitious example. Deliberately never
 * carries a name, a phone number or an e-mail: those are personal data the platform only ever
 * transmits to the assigned partner broker, never displayed as sample content on the public site.
 */
export function LeadExampleCard({ badgeLabel, fields }: LeadExampleCardProps) {
  return (
    <div className="am-leadexample" role="group" aria-label={badgeLabel}>
      <span className="am-leadexample__label">{badgeLabel}</span>
      <dl className="am-kv">
        {fields.map((field) => (
          <div key={field.label}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
