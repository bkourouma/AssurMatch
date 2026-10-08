import { useTranslations } from "next-intl";
import { Directory } from "./ui/directory";
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
 * The two regulatory sentences of a journey sign, in one compact notice.
 *
 * Both stay visible word for word (Constitution I and II) and neither is closable; stacking them as
 * two separate boxes only pushed the page content down and read as two warnings where there is one
 * regulatory frame. The notice is dashed: what it describes is indicative, to be confirmed.
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
 * Visitor journey shortcuts, as directory rows: one row, one destination. The country and product
 * default to the first publicly activated pair, but every caller that knows its own scope passes it
 * so the links never dead-end elsewhere.
 */
export function PublicJourneyActions({ countryCode = "CI", productKey = "auto" }: { countryCode?: string; productKey?: string }) {
  const t = useTranslations("Journey");
  const params = { countryCode, productKey };

  return (
    <nav className="am-j-next" aria-label={t("label")}>
      <h2 className="am-j-next__title">{t("title")}</h2>
      <Directory
        items={[
          {
            key: "compare",
            title: t("compare"),
            icon: "scale",
            href: { pathname: "/countries/[countryCode]/products/[productKey]/offers", params }
          },
          {
            key: "quote",
            title: t("quote"),
            icon: "file-text",
            href: { pathname: "/countries/[countryCode]/products/[productKey]/quote", params }
          },
          {
            key: "callback",
            title: t("callback"),
            icon: "phone",
            href: { pathname: "/countries/[countryCode]/products/[productKey]/quote", params }
          }
        ]}
      />
      <p className="am-j-note">{t("fineprint")}</p>
    </nav>
  );
}
