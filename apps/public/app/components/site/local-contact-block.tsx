import { useTranslations } from "next-intl";
import { Button } from "../ui/button";
import { Icon } from "../ui/icons";
import { WhatsAppButton } from "../ui/whatsapp-button";

export interface LocalContactBlockProps {
  /** International WhatsApp number of the local desk, when one is configured. */
  whatsappPhone?: string;
}

/** Primary-100 band placed just before the footer, on every page. */
export function LocalContactBlock({ whatsappPhone }: LocalContactBlockProps) {
  const t = useTranslations("Layout.localContact");
  return (
    <section className="am-localcontact" aria-label={t("title")}>
      <div className="am-container am-localcontact__inner">
        <h2 className="am-localcontact__title">{t("title")}</h2>
        <p className="am-localcontact__description">{t("description")}</p>
        <div className="am-cluster">
          {whatsappPhone ? <WhatsAppButton phone={whatsappPhone} label={t("whatsapp")} /> : null}
          <Button href="/contact" variant="secondary" icon={<Icon name="phone" size={20} />}>
            {t("callback")}
          </Button>
        </div>
      </div>
    </section>
  );
}
