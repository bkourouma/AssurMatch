import { useTranslations } from "next-intl";
import { Button } from "../ui/button";
import { Icon } from "../ui/icons";
import { IconTile } from "../ui/icon-tile";
import { WhatsAppButton } from "../ui/whatsapp-button";
import { Reveal } from "../motion/reveal";

export interface LocalContactBlockProps {
  /** International WhatsApp number of the local desk, when one is configured. */
  whatsappPhone?: string;
}

/**
 * Band placed just before the footer, on every page: one elevated card on the brand mesh, with the
 * handshake tile as its visual anchor and the two ways of reaching a partner broker.
 */
export function LocalContactBlock({ whatsappPhone }: LocalContactBlockProps) {
  const t = useTranslations("Layout.localContact");
  return (
    <section className="am-localcontact" aria-label={t("title")}>
      <div className="am-container">
        <Reveal className="am-localcontact__card">
          <IconTile name="handshake" size="lg" className="am-localcontact__tile" />
          <div className="am-localcontact__body">
            <h2 className="am-localcontact__title">{t("title")}</h2>
            <p className="am-localcontact__description">{t("description")}</p>
          </div>
          <div className="am-localcontact__actions">
            {whatsappPhone ? <WhatsAppButton phone={whatsappPhone} label={t("whatsapp")} /> : null}
            <Button href="/contact" variant="secondary" icon={<Icon name="phone" size={20} />}>
              {t("callback")}
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
