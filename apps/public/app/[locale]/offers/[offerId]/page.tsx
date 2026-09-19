import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../i18n/routing";
import { OfferCriteria, OfferScore, ScoreBreakdown, SponsoredBadge } from "../../../components/offer-cards";
import { IndicativeOfferNotice, TechnicalRoleNotice } from "../../../components/public-journey";
import { BackendText } from "../../../components/ui/backend-text";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/empty-state";
import { Hero } from "../../../components/ui/hero";
import { JsonLd } from "../../../components/ui/json-ld";
import { Notice } from "../../../components/ui/notice";
import { Section } from "../../../components/ui/section";
import { countryCurrency, formatDate } from "../../../lib/country-format";
import { getPublicOffer } from "../../../lib/public-api";
import { buildMetadata, localeUrl, offerJsonLd } from "../../../lib/seo";
import type { PageMetadata } from "../../../lib/seo";

/** Detail of one indicative offer: guarantees, limits, validity and responsible partner broker. */

type SearchParams = Record<string, string | string[] | undefined>;
type PageParams = { locale: string; offerId: string };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<PageMetadata> {
  const { locale: rawLocale, offerId } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "OfferDetail" });
  const offer = await getPublicOffer(offerId);
  const title = offer.status === "success" && offer.data ? `${offer.data.name} - ${t("title")}` : t("title");
  return buildMetadata({
    title,
    description: offer.status === "success" && offer.data?.shortDescription ? offer.data.shortDescription : t("description"),
    href: "/offers/[offerId]",
    params: { offerId },
    locale
  });
}

export default async function PublicOfferDetailPage({
  params,
  searchParams
}: {
  params: Promise<PageParams>;
  searchParams?: Promise<SearchParams>;
}) {
  const { locale: rawLocale, offerId } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations("OfferDetail");
  const common = await getTranslations("Common");
  const query = searchParams ? await searchParams : {};
  const countryCode = first(query.country);
  const productKey = first(query.product);
  const offer = await getPublicOffer(offerId);
  const detail = offer.status === "success" ? offer.data : null;
  const canonical = localeUrl(locale, "/offers/[offerId]", { offerId });

  return (
    <>
      <div className="am-container">
        <Breadcrumb
          label={common("breadcrumbLabel")}
          items={[
            { name: common("home"), url: localeUrl(locale, "/") },
            { name: t("breadcrumb"), url: canonical }
          ]}
        />
      </div>

      <Hero title={detail ? detail.name : t("title")} lead={t("description")}>
        <TechnicalRoleNotice />
        <IndicativeOfferNotice />
      </Hero>

      {!detail ? (
        <Section>
          <EmptyState
            title={t("unavailable.title")}
            description={offer.publicMessage ?? t("unavailable.description")}
            action={
              <Button href="/countries" variant="secondary">
                {t("backToCountries")}
              </Button>
            }
          />
        </Section>
      ) : (
        <>
          <Section title={t("criteriaTitle")}>
            <div className="am-cluster">
              {detail.score ? <OfferScore score={detail.score} /> : null}
              <SponsoredBadge offer={detail} />
            </div>
            {detail.shortDescription ? (
              <p className="pub-offer__summary">
                <BackendText>{detail.shortDescription}</BackendText>
              </p>
            ) : null}
            {detail.guaranteeSummary ? (
              <p className="pub-offer__summary">
                <BackendText>{detail.guaranteeSummary}</BackendText>
              </p>
            ) : null}
            <OfferCriteria offer={detail} countryCode={countryCode} />
            {detail.score ? <ScoreBreakdown score={detail.score} /> : null}
            <p className="am-field__hint">
              {t("validity", { date: formatDate(detail.validUntil, { locale, ...(countryCode ? { countryIso: countryCode } : {}) }) })}
              {detail.sourceOfInformation ? ` ${t("source", { source: detail.sourceOfInformation })}` : ""}
            </p>
          </Section>

          {detail.exclusionsSummary ? (
            <Section title={t("exclusionsTitle")} tone="muted">
              <p>
                <BackendText>{detail.exclusionsSummary}</BackendText>
              </p>
            </Section>
          ) : null}

          {detail.requiredDocuments.length > 0 ? (
            <Section title={t("documentsTitle")}>
              <ul className="pub-list">
                {detail.requiredDocuments.map((document) => (
                  <li key={document}>
                    <BackendText>{document}</BackendText>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title={t("disclaimersTitle")}>
            <ul className="pub-list">
              {detail.publicDisclaimers.map((disclaimer) => (
                <li key={disclaimer}>
                  <BackendText>{disclaimer}</BackendText>
                </li>
              ))}
            </ul>
            <Notice tone="indicative">{t("fineprint")}</Notice>
            <nav className="am-cluster" aria-label={t("actionsLabel")}>
              {countryCode && productKey ? (
                <>
                  <Button
                    variant="secondary"
                    href={{
                      pathname: "/countries/[countryCode]/products/[productKey]/offers",
                      params: { countryCode, productKey }
                    }}
                  >
                    {t("compare")}
                  </Button>
                  <Button
                    href={{
                      pathname: "/countries/[countryCode]/products/[productKey]/quote",
                      params: { countryCode, productKey },
                      query: { offerId: detail.id }
                    }}
                  >
                    {t("quote")}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" href="/countries">
                  {t("backToCountries")}
                </Button>
              )}
            </nav>
          </Section>

          <JsonLd
            data={offerJsonLd({
              name: detail.name,
              url: canonical,
              validUntil: detail.validUntil,
              currency: countryCurrency(countryCode),
              ...(detail.shortDescription ? { description: detail.shortDescription } : {}),
              ...(detail.indicativePriceMin !== undefined ? { price: detail.indicativePriceMin } : {}),
              ...(detail.partnerName ?? detail.brokerName ? { sellerName: (detail.partnerName ?? detail.brokerName) as string } : {})
            })}
          />
        </>
      )}
    </>
  );
}
