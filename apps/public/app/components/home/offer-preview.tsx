import { useTranslations } from "next-intl";
import { Badge } from "../ui/badge";
import { Icon } from "../ui/icons";
import { IconTile } from "../ui/icon-tile";

/**
 * Decorative composition shown in the second column of the home hero from 1024px up: a small stack
 * of offer cards drawn entirely in CSS.
 *
 * It carries NO data. Every label is a static word of the catalogue ("Offre indicative", "Prix
 * indicatif", "Score indicatif"), there is no price, no figure, no score and no broker name, and the
 * whole block is `aria-hidden` so a screen reader never mistakes it for a real result. The real
 * offers live behind the entry form next to it.
 */
export function OfferPreview() {
  const t = useTranslations("Home.preview");

  return (
    <div className="am-preview" aria-hidden="true">
      <div className="am-preview__stack">
        <article className="am-preview__card am-preview__card--behind">
          <div className="am-preview__ghostrow">
            <span className="am-preview__ghost" />
            <span className="am-preview__ghost am-preview__ghost--short" />
          </div>
        </article>

        <article className="am-preview__card am-preview__card--behind">
          <div className="am-preview__ghostrow">
            <span className="am-preview__ghost" />
            <span className="am-preview__ghost am-preview__ghost--short" />
          </div>
        </article>

        <article className="am-preview__card am-preview__card--front am-animate-float">
          <header className="am-preview__head">
            <IconTile name="car" size="md" />
            <p className="am-preview__title">{t("product")}</p>
            <p className="am-preview__partner">
              <Icon name="shield-check" size={14} />
              {t("partner")}
            </p>
            <Badge tone="neutral">{t("badge")}</Badge>
          </header>

          <ul className="am-pill-list">
            <li className="am-pill">
              <Icon name="check" size={14} />
              {t("guaranteeCivil")}
            </li>
            <li className="am-pill">
              <Icon name="check" size={14} />
              {t("guaranteeTheft")}
            </li>
            <li className="am-pill">
              <Icon name="check" size={14} />
              {t("guaranteeAssistance")}
            </li>
          </ul>

          <div className="am-preview__score">
            <p className="am-preview__label">{t("scoreLabel")}</p>
            <span className="am-preview__gauge" />
          </div>

          <div className="am-preview__row">
            <p className="am-preview__label">{t("priceLabel")}</p>
            <p className="am-preview__value">{t("priceValue")}</p>
          </div>
        </article>
      </div>
    </div>
  );
}
