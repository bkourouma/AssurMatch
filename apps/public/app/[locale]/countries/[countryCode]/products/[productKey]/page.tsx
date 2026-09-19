import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../../../i18n/routing";
import { productContent } from "../../../../../content/products";
import { IndicativeOfferNotice, PublicJourneyActions, TechnicalRoleNotice } from "../../../../../components/public-journey";
import { VisitorAiAssistant } from "../../../../../components/visitor-ai-assistant";
import { BackendText } from "../../../../../components/ui/backend-text";
import { Breadcrumb } from "../../../../../components/ui/breadcrumb";
import { Button } from "../../../../../components/ui/button";
import { Hero } from "../../../../../components/ui/hero";
import { Icon } from "../../../../../components/ui/icons";
import { JsonLd } from "../../../../../components/ui/json-ld";
import { Notice } from "../../../../../components/ui/notice";
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
      <div className="am-container">
        <Breadcrumb
          label={common("breadcrumbLabel")}
          items={[
            { name: common("home"), url: localeUrl(locale, "/") },
            { name: countries("breadcrumb"), url: localeUrl(locale, "/countries") },
            { name: countryName, url: localeUrl(locale, "/countries/[countryCode]", { countryCode }) },
            { name: productName ?? productKey, url: canonical }
          ]}
        />
      </div>

      <Hero title={heading} lead={t("lead")}>
        <TechnicalRoleNotice />
        <IndicativeOfferNotice />
        <div className="am-cluster">
          <Button href={{ pathname: "/countries/[countryCode]/products/[productKey]/offers", params: productParams }}>
            {t("compare")}
          </Button>
          <Button
            variant="secondary"
            href={{ pathname: "/countries/[countryCode]/products/[productKey]/quote", params: productParams }}
          >
            {t("quote")}
          </Button>
        </div>
      </Hero>

      {detail.status === "error" && !summary ? (
        <Section>
          <Notice tone="info" title={t("unavailable.title")}>
            {t("unavailable.description")}
          </Notice>
        </Section>
      ) : null}

      {product?.summary || (product?.guarantees && product.guarantees.length > 0) || (product?.exclusions && product.exclusions.length > 0) ? (
        <Section title={t("summaryTitle")}>
          {product?.summary ? (
            <p>
              <BackendText>{product.summary}</BackendText>
            </p>
          ) : null}
          {product?.guarantees && product.guarantees.length > 0 ? (
            <>
              <h3>{t("guaranteesTitle")}</h3>
              <ul className="pub-list">
                {product.guarantees.map((guarantee) => (
                  <li key={guarantee.key}>
                    <BackendText>
                      {guarantee.label}
                      {guarantee.detail ? ` - ${guarantee.detail}` : ""}
                    </BackendText>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {product?.exclusions && product.exclusions.length > 0 ? (
            <>
              <h3>{t("exclusionsTitle")}</h3>
              <ul className="pub-list">
                {product.exclusions.map((exclusion) => (
                  <li key={exclusion}>
                    <BackendText>{exclusion}</BackendText>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Section>
      ) : null}

      <Section
        title={t("documentsTitle")}
        tone="muted"
        {...(documents.length > 0 ? { lead: documentsFromApi ? t("documentsLead") : t("documentsFallbackLead") } : {})}
      >
        {documents.length > 0 ? (
          <ul className="pub-list">
            {documents.map((document) => (
              <li key={document}>{documentsFromApi ? <BackendText>{document}</BackendText> : document}</li>
            ))}
          </ul>
        ) : (
          <p>{t("documentsUnknown")}</p>
        )}
      </Section>

      {editorial && editorial.faq.length > 0 ? (
        <Section title={t("faqTitle")}>
          <div className="am-stack">
            {editorial.faq.map((entryFaq) => (
              <details className="pub-score" key={entryFaq.question}>
                <summary>{entryFaq.question}</summary>
                <p>{entryFaq.answer}</p>
              </details>
            ))}
          </div>
          <JsonLd data={faqJsonLd(editorial.faq)} />
        </Section>
      ) : null}

      <Section title={t("contactTitle")}>
        <ProductContact
          entry={entry}
          whatsappLabel={t("whatsapp")}
          callLabel={(phone) => t("call", { phone })}
        />
        <VisitorAiAssistant countryCode={countryCode} productKey={productKey} mode="product" />
        <VisitorAiAssistant countryCode={countryCode} mode="faq" />
      </Section>

      <Section>
        <PublicJourneyActions countryCode={countryCode} productKey={productKey} />
        <Notice tone="indicative">{t("fineprint")}</Notice>
      </Section>

      <JsonLd data={productJsonLd} />
    </>
  );
}

/**
 * Per-country contact of the product page.
 *
 * The public country directory exposes no WhatsApp or phone number today, so the block reads them
 * defensively and renders nothing until one is published. Adding a per-country contact to the
 * directory entry is a backend follow-up; this block picks it up without any change here.
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
  if (!entry) return null;
  const contactable = entry as PublicCountryDirectoryItem & { whatsapp?: unknown; phone?: unknown };
  const whatsapp = typeof contactable.whatsapp === "string" && contactable.whatsapp.trim() ? contactable.whatsapp.trim() : undefined;
  const phone = typeof contactable.phone === "string" && contactable.phone.trim() ? contactable.phone.trim() : undefined;
  if (!whatsapp && !phone) return null;

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
