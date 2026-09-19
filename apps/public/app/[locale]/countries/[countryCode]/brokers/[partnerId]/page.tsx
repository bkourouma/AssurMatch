import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../../../i18n/routing";
import { BackendText } from "../../../../../components/ui/backend-text";
import { Breadcrumb } from "../../../../../components/ui/breadcrumb";
import { BrokerBlock } from "../../../../../components/ui/broker-block";
import { Button } from "../../../../../components/ui/button";
import { Hero } from "../../../../../components/ui/hero";
import { JsonLd } from "../../../../../components/ui/json-ld";
import { Notice } from "../../../../../components/ui/notice";
import { Section } from "../../../../../components/ui/section";
import { getCountryPartner, listCountryDirectory, type PublicPartnerDetail, type PublicPartnerSummary } from "../../../../../lib/public-api";
import { formatDate } from "../../../../../lib/country-format";
import { buildMetadata, localBusinessJsonLd, localeUrl } from "../../../../../lib/seo";
import type { PageMetadata } from "../../../../../lib/seo";

/**
 * Broker profile page. `getCountryPartner` is read with only the fields the visitor is allowed to
 * see: an e-mail, a phone number, a plan or a capacity are never selected here even if a future API
 * version started returning one. A missing partner is a branded 404, never a crash.
 */

type PageParams = { locale: string; countryCode: string; partnerId: string };

/**
 * `getCountryPartner` in `lib/public-api.ts` (not owned by this page) is typed as returning
 * `PublicPartnerSummary`, but `GET /countries/:code/partners/:id` actually answers
 * `publicPartnerDetailSchema` - the summary plus `products` (resolved key/name pairs) and
 * `disclaimer`. Rather than casting the mismatch away, this guard checks the real shape at
 * runtime and narrows to it; a partner that truly lacks these fields falls through to `notFound()`.
 */
function isPartnerDetail(partner: PublicPartnerSummary): partner is PublicPartnerDetail {
  return "products" in partner && "disclaimer" in partner;
}

async function resolveCountryName(countryCode: string): Promise<string> {
  const directory = await listCountryDirectory();
  const iso = countryCode.trim().toUpperCase();
  return directory.data.find((item) => item.isoCode.toUpperCase() === iso)?.name ?? iso;
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<PageMetadata> {
  const { locale: rawLocale, countryCode, partnerId } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "Directory.broker" });
  const countryName = await resolveCountryName(countryCode);
  const partner = await getCountryPartner(countryCode, partnerId);
  const displayName = partner.status === "success" && partner.data ? partner.data.displayName : partnerId;
  return buildMetadata({
    title: t("title", { displayName, countryCode: countryName }),
    description: t("description", { displayName, countryCode: countryName }),
    href: "/countries/[countryCode]/brokers/[partnerId]",
    params: { countryCode, partnerId },
    locale
  });
}

export default async function CountryBrokerDetailPage({ params }: { params: Promise<PageParams> }) {
  const { locale: rawLocale, countryCode, partnerId } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);

  const partner = await getCountryPartner(countryCode, partnerId);
  if (partner.status !== "success" || !partner.data || !isPartnerDetail(partner.data)) notFound();

  // Explicit allow-list: only identity, licence and covered products ever reach the page, even though
  // the API state may carry other fields (phone, whatsapp, website...) in a later version.
  const { displayName, licenseNumber, issuingAuthority, city, licenseExpiresAt, products, disclaimer } = partner.data;

  const t = await getTranslations("Directory.broker");
  const brokers = await getTranslations("Directory.brokers");
  const common = await getTranslations("Common");
  const countries = await getTranslations("Countries");

  const countryName = await resolveCountryName(countryCode);

  const brokerLabels = {
    licenceNumber: common("licenceNumber"),
    issuingAuthority: common("issuingAuthority"),
    city: common("city"),
    products: common("products"),
    approved: common("approved")
  };

  const canonical = localeUrl(locale, "/countries/[countryCode]/brokers/[partnerId]", { countryCode, partnerId });

  return (
    <>
      <div className="am-container">
        <Breadcrumb
          label={common("breadcrumbLabel")}
          items={[
            { name: common("home"), url: localeUrl(locale, "/") },
            { name: countries("breadcrumb"), url: localeUrl(locale, "/countries") },
            { name: countryName, url: localeUrl(locale, "/countries/[countryCode]", { countryCode }) },
            { name: brokers("breadcrumb"), url: localeUrl(locale, "/countries/[countryCode]/brokers", { countryCode }) },
            { name: displayName, url: canonical }
          ]}
        />
      </div>

      <Hero title={displayName} lead={t("fineprint")} />

      <Section>
        <BrokerBlock
          variant="full"
          displayName={displayName}
          licenceNumber={licenseNumber}
          issuingAuthority={issuingAuthority}
          labels={brokerLabels}
          {...(city ? { city } : {})}
          {...(products.length > 0 ? { products: products.map((product) => product.name) } : {})}
        />
        <p className="am-broker__meta">
          {t("licenseExpiresAt")} : {formatDate(licenseExpiresAt, { locale, countryIso: countryCode })}
        </p>
      </Section>

      {products.length > 0 ? (
        <Section title={t("productsTitle")}>
          <div className="am-cluster">
            {products.map((product) => (
              <Button
                key={product.key}
                variant="secondary"
                href={{ pathname: "/countries/[countryCode]/products/[productKey]", params: { countryCode, productKey: product.key } }}
              >
                <BackendText>{product.name}</BackendText>
              </Button>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title={t("disclaimerTitle")}>
        <p>
          <BackendText>{disclaimer}</BackendText>
        </p>
      </Section>

      <Section>
        <Notice tone="indicative">{t("fineprint")}</Notice>
        <div className="am-cluster">
          <Button variant="secondary" href={{ pathname: "/countries/[countryCode]/brokers", params: { countryCode } }}>
            {t("back", { countryCode: countryName })}
          </Button>
        </div>
      </Section>

      <JsonLd
        data={localBusinessJsonLd({
          name: displayName,
          url: canonical,
          ...(city ? { city } : {}),
          countryIso: countryCode,
          licenceNumber: licenseNumber
        })}
      />
    </>
  );
}
