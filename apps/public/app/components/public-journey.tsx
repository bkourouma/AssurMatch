import { useTranslations } from "next-intl";
import { Button } from "./ui/button";
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
 * Visitor journey shortcuts. The country and product default to the first publicly activated pair,
 * but every caller that knows its own scope passes it so the links never dead-end elsewhere.
 */
export function PublicJourneyActions({ countryCode = "CI", productKey = "auto" }: { countryCode?: string; productKey?: string }) {
  const t = useTranslations("Journey");
  const params = { countryCode, productKey };

  return (
    <nav className="pub-card pub-card--plain" aria-label={t("label")}>
      <h2 className="pub-card__title">{t("title")}</h2>
      <div className="am-cluster">
        <Button variant="secondary" href={{ pathname: "/countries/[countryCode]/products/[productKey]/offers", params }}>
          {t("compare")}
        </Button>
        <Button href={{ pathname: "/countries/[countryCode]/products/[productKey]/quote", params }}>{t("quote")}</Button>
        <Button variant="secondary" href={{ pathname: "/countries/[countryCode]/products/[productKey]/quote", params }}>
          {t("callback")}
        </Button>
      </div>
      <p className="am-field__hint">{t("fineprint")}</p>
    </nav>
  );
}
