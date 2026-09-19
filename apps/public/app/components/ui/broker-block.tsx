import { Badge } from "./badge";
import { BackendText } from "./backend-text";
import { Icon } from "./icons";

export interface BrokerBlockLabels {
  licenceNumber: string;
  issuingAuthority: string;
  city: string;
  products: string;
  approved: string;
}

export interface BrokerBlockProps {
  displayName: string;
  licenceNumber: string;
  issuingAuthority: string;
  labels: BrokerBlockLabels;
  variant?: "card" | "line" | "full";
  city?: string;
  products?: readonly string[];
  approved?: boolean;
  description?: string;
}

/**
 * The responsible broker is always identified with its licence and its issuing authority
 * (Constitution I and II). The "Agree" badge is the validation green of the design system.
 */
export function BrokerBlock({
  displayName,
  licenceNumber,
  issuingAuthority,
  labels,
  variant = "card",
  city,
  products,
  approved,
  description
}: BrokerBlockProps) {
  return (
    <div className="am-broker" data-variant={variant}>
      <div>
        <p className="am-broker__name">
          <BackendText>{displayName}</BackendText>
        </p>
        {approved ? (
          <Badge tone="approved" icon={<Icon name="check" size={16} />}>
            {labels.approved}
          </Badge>
        ) : null}
      </div>
      <p className="am-broker__meta">
        {labels.licenceNumber} <BackendText>{licenceNumber}</BackendText>
        {" - "}
        {labels.issuingAuthority} <BackendText>{issuingAuthority}</BackendText>
        {city ? (
          <>
            {" - "}
            {labels.city} <BackendText>{city}</BackendText>
          </>
        ) : null}
      </p>
      {variant !== "line" && products && products.length > 0 ? (
        <>
          <p className="am-broker__meta">{labels.products}</p>
          <ul className="am-broker__products">
            {products.map((product) => (
              <li key={product}>
                <Badge tone="neutral">
                  <BackendText>{product}</BackendText>
                </Badge>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {variant === "full" && description ? (
        <p className="am-broker__meta">
          <BackendText>{description}</BackendText>
        </p>
      ) : null}
    </div>
  );
}
