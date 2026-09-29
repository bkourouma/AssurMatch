import { useTranslations } from "next-intl";
import { Icon } from "../ui/icons";

export interface OfferPreviewProps {
  /**
   * `validatedOffers` of `GET /public-stats`, when the endpoint really sent a positive number. The top
   * satellite then shows that published figure; without it the satellite falls back to plain words.
   */
  validatedOffers?: number;
}

/**
 * Decorative composition shown in the second column of the home hero from 1024px up: one offer card
 * drawn in CSS, floating, with two small glass "satellites" orbiting it.
 *
 * It invents NOTHING. Every label is a static word of the catalogue ("Offre indicative", "Prix
 * indicatif", "à confirmer par le courtier partenaire"); there is no price, no score value and no
 * broker name, and the only figure it may show is the public offer counter the stats band below
 * already publishes. The whole block is `aria-hidden` so a screen reader never mistakes it for a real
 * result: the real offers live behind the entry form next to it.
 */
export function OfferPreview({ validatedOffers }: OfferPreviewProps) {
  const t = useTranslations("Home.preview");
  const guarantees = [t("guaranteeCivil"), t("guaranteeTheft"), t("guaranteeAssistance")];
  const hasCount = typeof validatedOffers === "number" && Number.isFinite(validatedOffers) && validatedOffers > 0;

  return (
    <div className="am-preview" aria-hidden="true">
      <div className="am-preview__orbit">
        <article className="am-preview__card">
          <header className="am-preview__head">
            <span className="am-preview__glyph">
              <Icon name="car" size={24} />
            </span>
            <div className="am-preview__heading">
              <p className="am-preview__title">{t("product")}</p>
              <p className="am-preview__partner">
                <span className="am-preview__verified">
                  <Icon name="shield-check" size={12} />
                </span>
                {t("partner")}
              </p>
            </div>
            <span className="am-preview__badge">{t("badge")}</span>
          </header>

          <ul className="am-preview__guarantees">
            {guarantees.map((guarantee) => (
              <li key={guarantee} className="am-preview__guarantee">
                <span className="am-preview__tick">
                  <Icon name="check" size={12} />
                </span>
                {guarantee}
              </li>
            ))}
          </ul>

          <div className="am-preview__score">
            <p className="am-preview__label">
              <Icon name="target" size={14} />
              {t("scoreLabel")}
            </p>
            <span className="am-preview__gauge">
              <span className="am-preview__gaugefill" />
            </span>
          </div>

          <div className="am-preview__price">
            <span className="am-preview__tag">
              <Icon name="zap" size={12} />
              {t("previewTag")}
            </span>
            <div className="am-preview__pricerow">
              <p className="am-preview__label">{t("priceLabel")}</p>
              <p className="am-preview__value">{t("priceValue")}</p>
            </div>
            <p className="am-preview__pricenote">{t("priceNote")}</p>
          </div>
        </article>

        <div className="am-preview__satellite am-preview__satellite--top">
          <span className="am-status-ping" />
          <span className="am-preview__satbody">
            <strong>{hasCount ? t("offersTitle", { count: validatedOffers }) : t("offersFallback")}</strong>
            <span>{t("offersCaption")}</span>
          </span>
        </div>

        <div className="am-preview__satellite am-preview__satellite--bottom">
          <span className="am-preview__satglyph">
            <Icon name="handshake" size={16} />
          </span>
          <span className="am-preview__satbody">
            <strong>{t("relationTitle")}</strong>
            <span>{t("relationCaption")}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
