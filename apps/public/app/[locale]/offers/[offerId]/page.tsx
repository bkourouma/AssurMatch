import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "../../../../i18n/navigation";
import { toLocale } from "../../../../i18n/routing";
import { JourneyRoute } from "../../../components/journey/journey-route";
import { OfferCriteria, OfferPrice, OfferScore, ScoreBreakdown, SponsoredBadge } from "../../../components/offer-cards";
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
import { findOfferContext, getPublicOffer, listCountryPartners } from "../../../lib/public-api";
import { buildMetadata, localeUrl, offerJsonLd } from "../../../lib/seo";
import type { PageMetadata } from "../../../lib/seo";
import "../../../styles/pages/journey.css";

/**
 * Detail of one indicative offer: guarantees, limits, validity and responsible partner broker.
 *
 * The facts are one ruled definition list (the canonical reference of the offer); the dashed price,
 * the quote request and the responsible broker sit in the side column, sticky on wide screens.
 */

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
  const offer = await getPublicOffer(offerId);
  const detail = offer.status === "success" ? offer.data : null;
  // The offer cards link here with their country and product. A shared or bookmarked link carries
  // neither, so they are looked up: the route strip stays a way back and "Demander un devis" stays
  // the primary action instead of falling back to the country picker.
  const queryCountry = first(query.country);
  const queryProduct = first(query.product);
  const context = queryCountry && queryProduct ? null : detail ? await findOfferContext(offerId) : null;
  const countryCode = queryCountry && queryProduct ? queryCountry : (context?.countryCode ?? queryCountry);
  const productKey = queryCountry && queryProduct ? queryProduct : (context?.productKey ?? queryProduct);
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
        title={detail ? detail.name : t("title")}
        lead={t("description")}
        size="sm"
        route={<JourneyRoute current="offers" countryCode={countryCode} productKey={productKey} />}
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
        {/* The public detail endpoint does not always carry a score: an empty badge row would just
            be a gap under the title. */}
        {detail && (detail.score || detail.isSponsored) ? (
          <div className="am-cluster am-j-signbadges">
            {detail.score ? <OfferScore score={detail.score} size="lg" /> : null}
            <SponsoredBadge offer={detail} />
          </div>
        ) : null}
        <JourneyHeroNotice />
      </Hero>

      {!detail ? (
        <Section>
          {/*
           * FR-014: a single message names the three possible causes (expired, not yet validated,
           * partner no longer eligible) without claiming which one applies - the public endpoint
           * returns one generic error today (`public-offer-catalog.service.ts`), so telling them
           * apart on screen would either guess or leak a partner-specific reason (Constitution VIII).
           * "Comparer les offres" targets the very list the visitor came from when its country and
           * product are known from the query string; otherwise the generic country picker is kept.
           */}
          <EmptyState
            icon="search"
            align="center"
            title={t("unavailable.title")}
            description={
              // A 404 is exactly the "no longer public" case this message explains; only a real
              // service failure keeps the API wrapper's own message.
              offer.status === "error" && offer.messageKey !== "notFound" && offer.publicMessage
                ? offer.publicMessage
                : t("unavailable.description")
            }
            action={
              countryCode && productKey ? (
                <Button
                  href={{
                    pathname: "/countries/[countryCode]/products/[productKey]/offers",
                    params: { countryCode, productKey }
                  }}
                  icon={<Icon name="scale" size={18} />}
                >
                  {t("compare")}
                </Button>
              ) : (
                <Button href="/countries" icon={<Icon name="globe" size={18} />}>
                  {t("backToCountries")}
                </Button>
              )
            }
          />
        </Section>
      ) : (
        <>
          <Section ariaLabel={t("criteriaTitle")}>
            <div className="am-j-detail">
              {/* The side column comes first in the reading order: on a phone the dashed price, the
                  quote request and the responsible broker come before the facts; from 980px it
                  moves to the right-hand column (journey.css). */}
              <aside className="am-j-detail__aside" aria-label={t("actionsLabel")}>
                {/* The price carries its own "à confirmer" line: the full regulatory notice lives on
                    the sign, so the same sentence is not printed twice next to each other. */}
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

                <section className="am-j-part am-j-detail__broker" aria-labelledby="am-offer-broker">
                  <h2 className="am-j-part__title" id="am-offer-broker">
                    {t("brokerTitle")}
                  </h2>
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
                    <p className="am-j-detail__brokername">
                      <BackendText>{responsibleName ?? common("notProvided")}</BackendText>
                    </p>
                  )}
                  {countryCode ? (
                    <p className="am-j-morelink">
                      <Link href={{ pathname: "/countries/[countryCode]/brokers", params: { countryCode } }}>
                        {t("brokerDirectory")}
                        <Icon name="arrow-right" size={18} />
                      </Link>
                    </p>
                  ) : null}
                </section>
              </aside>

              <div className="am-j-detail__main">
                <section className="am-j-part" aria-labelledby="am-offer-criteria">
                  <h2 className="am-j-part__title" id="am-offer-criteria">
                    {t("criteriaTitle")}
                  </h2>
                  {detail.shortDescription ? (
                    <p className="am-lead">
                      <BackendText>{detail.shortDescription}</BackendText>
                    </p>
                  ) : null}
                  {detail.guaranteeSummary ? (
                    <p className="am-j-measure">
                      <BackendText>{detail.guaranteeSummary}</BackendText>
                    </p>
                  ) : null}
                  <OfferCriteria offer={detail} countryCode={countryCode} />
                  {detail.score ? <ScoreBreakdown score={detail.score} /> : null}
                  <p className="am-j-note">
                    {t("validity", { date: formatDate(detail.validUntil, { locale, ...(countryCode ? { countryIso: countryCode } : {}) }) })}
                    {detail.sourceOfInformation ? ` ${t("source", { source: detail.sourceOfInformation })}` : ""}
                  </p>
                </section>

                {detail.exclusionsSummary ? (
                  <section className="am-j-part" aria-labelledby="am-offer-exclusions">
                    <h2 className="am-j-part__title" id="am-offer-exclusions">
                      {t("exclusionsTitle")}
                    </h2>
                    <p className="am-j-measure">
                      <BackendText>{detail.exclusionsSummary}</BackendText>
                    </p>
                  </section>
                ) : null}

                {detail.requiredDocuments.length > 0 ? (
                  <section className="am-j-part" aria-labelledby="am-offer-documents">
                    <h2 className="am-j-part__title" id="am-offer-documents">
                      {t("documentsTitle")}
                    </h2>
                    <ul className="am-j-ticks">
                      {detail.requiredDocuments.map((document) => (
                        <li key={document}>
                          <Icon name="file-check" size={20} />
                          <span>
                            <BackendText>{document}</BackendText>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <section className="am-j-part" aria-labelledby="am-offer-disclaimers">
                  <h2 className="am-j-part__title" id="am-offer-disclaimers">
                    {t("disclaimersTitle")}
                  </h2>
                  <ul className="am-j-ticks" data-tone="muted">
                    {detail.publicDisclaimers.map((disclaimer) => (
                      <li key={disclaimer}>
                        <Icon name="info" size={20} />
                        <span>
                          <BackendText>{disclaimer}</BackendText>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Notice tone="indicative">{t("fineprint")}</Notice>
                </section>
              </div>

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
