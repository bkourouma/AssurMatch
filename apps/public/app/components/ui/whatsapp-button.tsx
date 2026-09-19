import { Button } from "./button";
import { Icon } from "./icons";

export interface WhatsAppButtonProps {
  /** International number without the leading +, e.g. 2250700000000. */
  phone: string;
  label: string;
  /** Prefilled message; kept short and free of personal data. */
  message?: string;
  fullWidth?: boolean;
}

export function WhatsAppButton({ phone, label, message, fullWidth }: WhatsAppButtonProps) {
  const digits = phone.replace(/[^\d]/g, "");
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return (
    <Button
      variant="whatsapp"
      externalHref={`https://wa.me/${digits}${query}`}
      target="_blank"
      icon={<Icon name="whatsapp" size={20} />}
      fullWidth={fullWidth ?? false}
    >
      {label}
    </Button>
  );
}
