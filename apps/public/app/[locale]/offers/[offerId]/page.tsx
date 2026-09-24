import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../i18n/routing";
import {
  OfferCriteria,
  OfferFacts,
  OfferGuarantees,
  OfferParties,
  OfferPrice,
  OfferScore,
  ScoreBreakdown,
  SponsoredBadge
} from "../../../components/offer-cards";
import { JourneyHeroNotice } from "../../../components/public-journey";
import { BackendText } from "../../../components/ui/backend-text";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { BrokerBlock } from "../../../components/ui/broker-block";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/empty-state";
import { Hero } from "../../../components/ui/hero";
import { Icon } from "../../../components/ui/icons";
import { JsonLd } from "../../../components/ui/json-ld";
import { Notice } from "../../../components/ui/notice";
import { Section } from "../../../components/ui/section";
import { countryCurrency, formatDate } from "../../../lib/country-format";
import { getPublicOffer, listCountryPartners } from "../../../lib/public-api";
import { buildMetadata, localeUrl, offerJsonLd } from "../../../lib/seo";
import type { PageMetadata } from "../../../lib/seo";
import "../../../styles/pages/journey.css";

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

  // The offer itself carries only the partner's display name. When the visitor arrived with a
  // country in the query, the public partner directory of that country supplies the licence and the
  // issuing authority so the responsible broker is identified in full; otherwise the name alone is
  // shown rather than an invented licence.
  const responsibleName = detail?.partnerName ?? detail?.brokerName;
  const partners = countryCode && responsibleName ? await listCountryPartners(countryCode) : null;
  const partner = responsibleName
    ? partners?.data.find((item) => item.displayName.trim().toLowerCase() === responsibleName.trim().toLowerCase())
    : undefined;

  const brokerLabels = {
    licenceNumber: common("licenceNumber"),
    issuingAuthority: common("issuingAuthority"),
    city: common("city"),
    products: common("products"),
    approved: common("approved")
  };

  return (
    <>
      <Hero
        kicker={t("kicker")}
        title={detail ? detail.name : t("title")}
        lead={t("description")}
        size="sm"
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: t("breadcrumb"), url: canonical }
            ]}
          />
        }
      >
        <div className="am-stack">
          {/* The public detail endpoint does not always carry a score: an empty badge row would
              just be a gap under the title. */}
          {detail && (detail.score || detail.isSponsored) ? (
            <div className="am-cluster">
              {detail.score ? <OfferScore score={detail.score} size="lg" /> : null}
              <SponsoredBadge offer={detail} />
            </div>
          ) : null}
          <JourneyHeroNotice />
        </div>
      </Hero>

      {!detail ? (
        <Section>
          <EmptyState
            icon="search"
            tone="muted"
            align="center"
            title={t("unavailable.title")}
            description={offer.publicMessage ?? t("unavailable.description")}
            action={
              <Button href="/countries" icon={<Icon name="globe" size={18} />}>
                {t("backToCountries")}
              </Button>
            }
          />
        </Section>
      ) : (
        <>
          <Section ariaLabel={t("criteriaTitle")}>
            <div className="am-j-detail">
              <div className="am-j-detail__main">
                <div className="am-j-block">
                  <h2 className="am-j-block__title">{t("criteriaTitle")}</h2>
                  <OfferParties offer={detail} />
                  {detail.shortDescription ? (
                    <p className="am-lead">
                      <BackendText>{detail.shortDescription}</BackendText>
                    </p>
                  ) : null}
                  {detail.guaranteeSummary ? (
                    <p>
                      <BackendText>{detail.guaranteeSummary}</BackendText>
                    </p>
                  ) : null}
                  <OfferFacts offer={detail} countryCode={countryCode} />
                  <OfferGuarantees offer={detail} />
                  <details className="am-j-more">
                    <summary>{t("allCriteria")}</summary>
                    <div className="am-j-more__body">
                      <OfferCriteria offer={detail} countryCode={countryCode} />
                      {detail.score ? <ScoreBreakdown score={detail.score} /> : null}
                    </div>
                  </details>
                  <p className="am-j-fineprint">
                    {t("validity", { date: formatDate(detail.validUntil, { locale, ...(countryCode ? { countryIso: countryCode } : {}) }) })}
                    {detail.sourceOfInformation ? ` ${t("source", { source: detail.sourceOfInformation })}` : ""}
                  </p>
                </div>

                {detail.exclusionsSummary ? (
                  <div className="am-j-block">
                    <h2 className="am-j-block__title">{t("exclusionsTitle")}</h2>
                    <p>
                      <BackendText>{detail.exclusionsSummary}</BackendText>
                    </p>
                  </div>
                ) : null}

                {detail.requiredDocuments.length > 0 ? (
                  <div className="am-j-block">
                    <h2 className="am-j-block__title">{t("documentsTitle")}</h2>
                    <ul className="am-j-list">
                      {detail.requiredDocuments.map((document) => (
                        <li key={document}>
                          <Icon name="file-check" size={18} />
                          <BackendText>{document}</BackendText>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="am-j-block">
                  <h2 className="am-j-block__title">{t("disclaimersTitle")}</h2>
                  <ul className="am-j-list">
                    {detail.publicDisclaimers.map((disclaimer) => (
                      <li key={disclaimer}>
                        <Icon name="info" size={18} />
                        <BackendText>{disclaimer}</BackendText>
                      </li>
                    ))}
                  </ul>
                  <Notice tone="indicative">{t("fineprint")}</Notice>
                </div>
              </div>

              <aside className="am-j-detail__aside" aria-label={t("actionsLabel")}>
                <div className="am-j-detail__card">
                  {/* The price block carries its own indicative notice: the full-width one lives in
                      the hero so the same sentence is not printed twice next to each other. */}
                  <OfferPrice offer={detail} countryCode={countryCode} />
                  <div className="am-j-detail__actions">
                    {countryCode && productKey ? (
                      <>
                        <Button
                          href={{
                            pathname: "/countries/[countryCode]/products/[productKey]/quote",
                            params: { countryCode, productKey },
                            query: { offerId: detail.id }
                          }}
                          size="lg"
                        >
                          {t("quote")}
                        </Button>
                        <Button
                          variant="secondary"
                          href={{
                            pathname: "/countries/[countryCode]/products/[productKey]/offers",
                            params: { countryCode, productKey }
                          }}
                          icon={<Icon name="scale" size={18} />}
                        >
                          {t("compare")}
                        </Button>
                      </>
                    ) : (
                      <Button variant="secondary" href="/countries" icon={<Icon name="globe" size={18} />}>
                        {t("backToCountries")}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="am-j-block">
                  <h2 className="am-j-block__title">{t("brokerTitle")}</h2>
                  {partner ? (
                    <BrokerBlock
                      variant="full"
                      displayName={partner.displayName}
                      licenceNumber={partner.licenseNumber}
                      issuingAuthority={partner.issuingAuthority}
                      labels={brokerLabels}
                      approved
                      {...(partner.city ? { city: partner.city } : {})}
                    />
                  ) : (
                    <p>
                      <BackendText>{responsibleName ?? common("notProvided")}</BackendText>
                    </p>
                  )}
                  {countryCode ? (
                    <Button
                      variant="tertiary"
                      size="sm"
                      href={{ pathname: "/countries/[countryCode]/brokers", params: { countryCode } }}
                      iconAfter={<Icon name="arrow-right" size={16} />}
                    >
                      {t("brokerDirectory")}
                    </Button>
                  ) : null}
                </div>
              </aside>
            </div>
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
