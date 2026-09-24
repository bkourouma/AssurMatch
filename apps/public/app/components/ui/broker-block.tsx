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

/** Two letters standing in for a partner logo, e.g. "Assur Plus" -> "AP". */
function initials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const first = words[0]?.charAt(0) ?? "";
  const second = words.length > 1 ? (words[words.length - 1]?.charAt(0) ?? "") : (words[0]?.charAt(1) ?? "");
  return `${first}${second}`;
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
      <div className="am-broker__head">
        {variant !== "line" ? (
          <span className="am-broker__avatar" aria-hidden="true">
            {initials(displayName)}
          </span>
        ) : null}
        <div>
          <p className="am-broker__name">
            <BackendText>{displayName}</BackendText>
          </p>
          {approved ? (
            <Badge tone="approved" icon={<Icon name="badge-check" size={16} />}>
              {labels.approved}
            </Badge>
          ) : null}
        </div>
      </div>
      <p className="am-broker__meta">
        <Icon name="shield-check" size={16} />
        <span>
          {labels.licenceNumber} <BackendText>{licenceNumber}</BackendText>
          {" - "}
          {labels.issuingAuthority} <BackendText>{issuingAuthority}</BackendText>
          {city ? (
            <>
              {" - "}
              {labels.city} <BackendText>{city}</BackendText>
            </>
          ) : null}
        </span>
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
