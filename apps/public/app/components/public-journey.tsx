import { useTranslations } from "next-intl";
import { Button } from "./ui/button";
import { Icon } from "./ui/icons";
import { IconTile } from "./ui/icon-tile";
import { Notice } from "./ui/notice";

/** Technical-platform positioning, repeated in every public journey (Constitution I). */
export function TechnicalRoleNotice() {
  const t = useTranslations("Journey");
  return <Notice tone="info">{t("technicalRole")}</Notice>;
}

/** Indicative pricing notice. It is never closable and never hidden behind an interaction. */
export function IndicativeOfferNotice() {
  const t = useTranslations("Journey");
  return <Notice tone="indicative">{t("indicative")}</Notice>;
}

/**
 * The two regulatory sentences of a journey hero, in one compact notice.
 *
 * Both stay visible word for word (Constitution I and II) and neither is closable; stacking them as
 * two separate boxes only pushed the page content down and read as two warnings where there is one
 * regulatory frame. The per-price compact notice inside the cards and the bottom fineprint are
 * unchanged.
 */
export function JourneyHeroNotice() {
  const t = useTranslations("Journey");
  return (
    <Notice tone="indicative" compact className="am-j-heronotice">
      <p>{t("technicalRole")}</p>
      <p>{t("indicative")}</p>
    </Notice>
  );
}

/**
 * Visitor journey shortcuts. The country and product default to the first publicly activated pair,
 * but every caller that knows its own scope passes it so the links never dead-end elsewhere.
 */
export function PublicJourneyActions({ countryCode = "CI", productKey = "auto" }: { countryCode?: string; productKey?: string }) {
  const t = useTranslations("Journey");
  const params = { countryCode, productKey };

  return (
    <nav className="am-j-panel am-j-panel--brand" aria-label={t("label")}>
      <div className="am-j-panel__head">
        <IconTile name="compass" size="lg" />
        <h2 className="am-j-panel__title">{t("title")}</h2>
      </div>
      <div className="am-cluster">
        <Button
          variant="secondary"
          href={{ pathname: "/countries/[countryCode]/products/[productKey]/offers", params }}
          icon={<Icon name="scale" size={18} />}
        >
          {t("compare")}
        </Button>
        <Button
          href={{ pathname: "/countries/[countryCode]/products/[productKey]/quote", params }}
          icon={<Icon name="file-text" size={18} />}
        >
          {t("quote")}
        </Button>
        <Button
          variant="secondary"
          href={{ pathname: "/countries/[countryCode]/products/[productKey]/quote", params }}
          icon={<Icon name="phone" size={18} />}
        >
          {t("callback")}
        </Button>
      </div>
      <p className="am-j-fineprint">{t("fineprint")}</p>
    </nav>
  );
}
