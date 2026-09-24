import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../../../i18n/routing";
import { productContent } from "../../../../../content/products";
import { JourneyHeroNotice, PublicJourneyActions } from "../../../../../components/public-journey";
import { productIcon } from "../../../../../components/journey/product-icon";
import { VisitorAiAssistant } from "../../../../../components/visitor-ai-assistant";
import { BackendText } from "../../../../../components/ui/backend-text";
import { Breadcrumb } from "../../../../../components/ui/breadcrumb";
import { Button } from "../../../../../components/ui/button";
import { Hero } from "../../../../../components/ui/hero";
import { Icon } from "../../../../../components/ui/icons";
import { IconTile } from "../../../../../components/ui/icon-tile";
import { JsonLd } from "../../../../../components/ui/json-ld";
import { Notice } from "../../../../../components/ui/notice";
import { Reveal } from "../../../../../components/motion/reveal";
import { Section } from "../../../../../components/ui/section";
import { WhatsAppButton } from "../../../../../components/ui/whatsapp-button";
import { uniqueStrings } from "../../../../../lib/format";
import {
  getPublicOffer,
  getPublicProduct,
  listCountryDirectory,
  listPublicOffers,
  listPublicProducts,
  type PublicCountryDirectoryItem
} from "../../../../../lib/public-api";
import { buildMetadata, faqJsonLd, localeUrl } from "../../../../../lib/seo";
import type { PageMetadata } from "../../../../../lib/seo";

/**
 * Product page of a country.
 *
 * The product is read from `GET /countries/:code/products/:key` so the page shows the catalogue name
 * rather than the raw key, and the "documents to prepare" section is built from what the published
 * offers actually require, with the editorial list of `app/content/products.ts` as a fallback.
 */

type PageParams = { locale: string; countryCode: string; productKey: string };

/** Number of offer details read to collect the documents they require. */
const OFFERS_SAMPLED_FOR_DOCUMENTS = 4;

/** Criteria the indicative score weighs, in the order the score explainer lists them. */
const SCORE_CRITERIA = [
  { key: "price", icon: "coins" },
  { key: "guaranteeLevel", icon: "shield-check" },
  { key: "deductible", icon: "wallet" },
  { key: "processingSpeed", icon: "clock" },
  { key: "paymentFlexibility", icon: "calendar" },
  { key: "informationQuality", icon: "file-check" }
] as const;

/**
 * The public country directory exposes no WhatsApp or phone number today, so both the section and
 * the block below read the optional fields defensively rather than assume they exist.
 */
function countryContactOf(entry: PublicCountryDirectoryItem | undefined): { whatsapp?: string; phone?: string } | null {
  if (!entry) return null;
  const contactable = entry as PublicCountryDirectoryItem & { whatsapp?: unknown; phone?: unknown };
  const whatsapp = typeof contactable.whatsapp === "string" && contactable.whatsapp.trim() ? contactable.whatsapp.trim() : undefined;
  const phone = typeof contactable.phone === "string" && contactable.phone.trim() ? contactable.phone.trim() : undefined;
  if (!whatsapp && !phone) return null;
  return { ...(whatsapp ? { whatsapp } : {}), ...(phone ? { phone } : {}) };
}

async function resolveNames(countryCode: string, productKey: string): Promise<{ country: string; product: string | undefined; entry: PublicCountryDirectoryItem | undefined }> {
  const directory = await listCountryDirectory();
  const iso = countryCode.trim().toUpperCase();
  const entry = directory.data.find((item) => item.isoCode.toUpperCase() === iso);
  const detail = await getPublicProduct(countryCode, productKey);
  if (detail.status === "success" && detail.data) {
    return { country: entry?.name ?? iso, product: detail.data.name, entry };
  }
  const products = await listPublicProducts(countryCode);
  const summary = products.data.find((item) => item.key === productKey);
  return { country: entry?.name ?? iso, product: summary?.name, entry };
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<PageMetadata> {
  const { locale: rawLocale, countryCode, productKey } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "Product" });
  const { country, product } = await resolveNames(countryCode, productKey);
  const title = product ? t("title", { product, country }) : t("titleFallback", { productKey, country });
  return buildMetadata({
    title,
    description: t("description", { product: product ?? productKey, country }),
    href: "/countries/[countryCode]/products/[productKey]",
    params: { countryCode, productKey },
    locale
  });
}

export default async function PublicProductPage({ params }: { params: Promise<PageParams> }) {
  const { locale: rawLocale, countryCode, productKey } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations("Product");
  const common = await getTranslations("Common");
  const countries = await getTranslations("Countries");
  const offerCards = await getTranslations("OfferCards");
  const productParams = { countryCode, productKey };

  const directory = await listCountryDirectory();
  const iso = countryCode.trim().toUpperCase();
  const entry = directory.data.find((item) => item.isoCode.toUpperCase() === iso);
  const countryName = entry?.name ?? iso;

  const detail = await getPublicProduct(countryCode, productKey);
  const product = detail.status === "success" ? detail.data : null;
  const summaries = product ? null : await listPublicProducts(countryCode);
  const summary = summaries?.data.find((item) => item.key === productKey);
  const productName = product?.name ?? summary?.name;
  const heading = productName ? t("title", { product: productName, country: countryName }) : t("titleFallback", { productKey, country: countryName });

  // Documents actually required by the published offers of this product, then the editorial list.
  const offers = await listPublicOffers(countryCode, productKey);
  const sampled = await Promise.all(
    offers.data.slice(0, OFFERS_SAMPLED_FOR_DOCUMENTS).map((offer) => getPublicOffer(offer.id))
  );
  const documentsFromOffers = uniqueStrings([
    ...(product?.requiredDocuments ?? []),
    ...sampled.flatMap((state) => state.data?.requiredDocuments ?? [])
  ]);
  const editorial = productContent(locale, productKey);
  const documents = documentsFromOffers.length > 0 ? documentsFromOffers : editorial?.documents ?? [];
  const documentsFromApi = documentsFromOffers.length > 0;
  const hasLocalContact = countryContactOf(entry) !== null;

  const canonical = localeUrl(locale, "/countries/[countryCode]/products/[productKey]", productParams);
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: productName ?? productKey,
    category: "Insurance",
    url: canonical,
    ...(product?.summary ? { description: product.summary } : {}),
    ...(entry ? { areaServed: entry.isoCode } : {})
  };

  return (
    <>
      <Hero
        kicker={t("kicker")}
        title={heading}
        lead={t("lead")}
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: countries("breadcrumb"), url: localeUrl(locale, "/countries") },
              { name: countryName, url: localeUrl(locale, "/countries/[countryCode]", { countryCode }) },
              { name: productName ?? productKey, url: canonical }
            ]}
          />
        }
        actions={
          <>
            <Button
              href={{ pathname: "/countries/[countryCode]/products/[productKey]/offers", params: productParams }}
              icon={<Icon name="scale" size={18} />}
              size="lg"
            >
              {t("compare")}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              href={{ pathname: "/countries/[countryCode]/products/[productKey]/quote", params: productParams }}
            >
              {t("quote")}
            </Button>
          </>
        }
        aside={
          <div className="am-j-countrycard">
            <div className="am-j-countrycard__head">
              <IconTile name={productIcon(productKey)} size="lg" />
              <div>
                <p className="am-j-countrycard__name">
                  <BackendText>{productName ?? productKey}</BackendText>
                </p>
                <p className="am-j-meta">
                  <span>
                    <Icon name="map-pin" size={16} />
                    <BackendText>{countryName}</BackendText>
                  </span>
                </p>
              </div>
            </div>
            <ul className="am-pill-list">
              <li className="am-pill">
                <Icon name="list" size={16} />
                {t("offersCount", { count: offers.data.length })}
              </li>
            </ul>
          </div>
        }
      >
        {/* Both regulatory sentences, in one compact notice rather than two stacked boxes. */}
        <JourneyHeroNotice />
      </Hero>

      {detail.status === "error" && !summary ? (
        <Section spacing="compact">
          <Notice tone="info" title={t("unavailable.title")}>
            {t("unavailable.description")}
          </Notice>
        </Section>
      ) : null}

      {product?.summary || (product?.guarantees && product.guarantees.length > 0) || (product?.exclusions && product.exclusions.length > 0) ? (
        <Section title={t("summaryTitle")}>
          <div className="am-stack am-stack--xl">
            {product?.summary ? (
              <p className="am-lead">
                <BackendText>{product.summary}</BackendText>
              </p>
            ) : null}
            {product?.guarantees && product.guarantees.length > 0 ? (
              <div className="am-stack">
                <h3>{t("guaranteesTitle")}</h3>
                <Reveal as="ul" stagger className="am-j-features">
                  {product.guarantees.map((guarantee) => (
                    <li className="am-j-feature" key={guarantee.key}>
                      <IconTile name="shield-check" tone="success" size="sm" />
                      <div>
                        <p className="am-j-feature__title">
                          <BackendText>{guarantee.label}</BackendText>
                        </p>
                        {guarantee.detail ? (
                          <p className="am-j-feature__detail">
                            <BackendText>{guarantee.detail}</BackendText>
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </Reveal>
              </div>
            ) : null}
            {product?.exclusions && product.exclusions.length > 0 ? (
              <div className="am-stack">
                <h3>{t("exclusionsTitle")}</h3>
                <ul className="am-j-list">
                  {product.exclusions.map((exclusion) => (
                    <li key={exclusion}>
                      <Icon name="minus" size={18} />
                      <BackendText>{exclusion}</BackendText>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section
        title={t("documentsTitle")}
        tone="muted"
        {...(documents.length > 0 ? { lead: documentsFromApi ? t("documentsLead") : t("documentsFallbackLead") } : {})}
      >
        {documents.length > 0 ? (
          <ul className="am-j-list">
            {documents.map((document) => (
              <li key={document}>
                <Icon name="file-check" size={18} />
                {documentsFromApi ? <BackendText>{document}</BackendText> : document}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t("documentsUnknown")}</p>
        )}
      </Section>

      <Section spacing="compact">
        <div className="am-j-panel">
          <div className="am-j-panel__head">
            <IconTile name="calculator" size="lg" />
            <h2 className="am-j-panel__title">{t("scoreTitle")}</h2>
          </div>
          <p className="am-j-panel__lead">{t("scoreLead")}</p>
          <ul className="am-j-points">
            {SCORE_CRITERIA.map((criterion) => (
              <li key={criterion.key}>
                <Icon name={criterion.icon} size={18} />
                {offerCards(`criterionLabels.${criterion.key}`)}
              </li>
            ))}
          </ul>
          <p className="am-j-fineprint">{t("scoreFineprint")}</p>
        </div>
      </Section>

      {editorial && editorial.faq.length > 0 ? (
        <Section title={t("faqTitle")} tone="muted">
          <div className="am-faq">
            {editorial.faq.map((entryFaq) => (
              <details className="am-faq__item" key={entryFaq.question}>
                <summary>{entryFaq.question}</summary>
                <p className="am-faq__answer">{entryFaq.answer}</p>
              </details>
            ))}
          </div>
          <JsonLd data={faqJsonLd(editorial.faq)} />
        </Section>
      ) : null}

      {hasLocalContact ? (
        <Section title={t("contactTitle")}>
          <ProductContact entry={entry} whatsappLabel={t("whatsapp")} callLabel={(phone) => t("call", { phone })} />
        </Section>
      ) : null}

      {/* Hidden by CSS until the availability check has confirmed at least one assistant. */}
      <Section title={t("assistantTitle")} lead={t("assistantLead")} className="am-j-optional">
        <div className="am-j-assist">
          <VisitorAiAssistant countryCode={countryCode} productKey={productKey} mode="product" />
          <VisitorAiAssistant countryCode={countryCode} mode="faq" />
        </div>
      </Section>

      <Section spacing="compact">
        <div className="am-stack am-stack--lg">
          <PublicJourneyActions countryCode={countryCode} productKey={productKey} />
          <Notice tone="indicative">{t("fineprint")}</Notice>
        </div>
      </Section>

      <JsonLd data={productJsonLd} />
    </>
  );
}

/**
 * Per-country contact of the product page.
 *
 * Adding a per-country contact to the directory entry is a backend follow-up; this block picks it up
 * without any change here, and the section around it only appears once a number is published.
 */
function ProductContact({
  entry,
  whatsappLabel,
  callLabel
}: {
  entry: PublicCountryDirectoryItem | undefined;
  whatsappLabel: string;
  callLabel: (phone: string) => string;
}) {
  const contact = countryContactOf(entry);
  if (!contact) return null;
  const { whatsapp, phone } = contact;

  return (
    <div className="am-cluster">
      {whatsapp ? <WhatsAppButton phone={whatsapp} label={whatsappLabel} /> : null}
      {phone ? (
        <a className="am-button" data-variant="secondary" href={`tel:${phone.replace(/[^+\d]/g, "")}`}>
          <Icon name="phone" size={20} />
          <span>{callLabel(phone)}</span>
        </a>
      ) : null}
    </div>
  );
}
