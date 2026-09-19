import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "../../../../i18n/navigation";
import { toLocale, type AppLocale } from "../../../../i18n/routing";
import { WaitlistForm, type WaitlistProductOption } from "../../../components/forms/waitlist-form";
import { PlatformStatusNotice } from "../../../components/site/platform-status-notice";
import { BackendText } from "../../../components/ui/backend-text";
import { Badge } from "../../../components/ui/badge";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { BrokerBlock } from "../../../components/ui/broker-block";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/empty-state";
import { Hero } from "../../../components/ui/hero";
import { Icon } from "../../../components/ui/icons";
import { Notice } from "../../../components/ui/notice";
import { Section } from "../../../components/ui/section";
import { WhatsAppButton } from "../../../components/ui/whatsapp-button";
import {
  listCountryDirectory,
  listCountryPartners,
  listPublicProducts,
  type PublicCountryDirectoryItem
} from "../../../lib/public-api";
import { buildMetadata, localeUrl } from "../../../lib/seo";
import type { PageMetadata } from "../../../lib/seo";

/**
 * Country page (SITE-108) and its waiting-list variant (SITE-109).
 *
 * The country is resolved through the public directory: a country the directory does not know is a
 * 404. A country whose availability is `waitlist` renders an indexable-free waiting page with no
 * path to a quote at all, because no partner broker is authorised there yet.
 */

type PageParams = { locale: string; countryCode: string };

const BROKERS_ON_COUNTRY_PAGE = 3;

async function resolveCountry(countryCode: string): Promise<PublicCountryDirectoryItem | undefined> {
  const directory = await listCountryDirectory();
  const iso = countryCode.trim().toUpperCase();
  return directory.data.find((country) => country.isoCode.toUpperCase() === iso);
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<PageMetadata> {
  const { locale: rawLocale, countryCode } = await params;
  const locale = toLocale(rawLocale);
  const country = await resolveCountry(countryCode);
  const name = country?.name ?? countryCode.toUpperCase();

  if (country?.availability === "waitlist") {
    const waitlist = await getTranslations({ locale, namespace: "Waitlist" });
    return buildMetadata({
      title: waitlist("title", { country: name }),
      description: waitlist("description"),
      href: "/countries/[countryCode]",
      params: { countryCode },
      locale,
      noindex: true
    });
  }

  const t = await getTranslations({ locale, namespace: "Country" });
  return buildMetadata({
    title: t("title", { country: name }),
    description: t("description", { country: name }),
    href: "/countries/[countryCode]",
    params: { countryCode },
    locale
  });
}

export default async function PublicCountryPage({ params }: { params: Promise<PageParams> }) {
  const { locale: rawLocale, countryCode } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);

  const country = await resolveCountry(countryCode);
  if (!country) notFound();

  return country.availability === "waitlist" ? (
    <WaitingCountry locale={locale} country={country} countryCode={countryCode} />
  ) : (
    <OpenCountry locale={locale} country={country} countryCode={countryCode} />
  );
}

interface VariantProps {
  locale: AppLocale;
  country: PublicCountryDirectoryItem;
  countryCode: string;
}

async function CountryBreadcrumb({ locale, country, countryCode }: VariantProps) {
  const common = await getTranslations({ locale, namespace: "Common" });
  const countries = await getTranslations({ locale, namespace: "Countries" });
  return (
    <div className="am-container">
      <Breadcrumb
        label={common("breadcrumbLabel")}
        items={[
          { name: common("home"), url: localeUrl(locale, "/") },
          { name: countries("breadcrumb"), url: localeUrl(locale, "/countries") },
          { name: country.name, url: localeUrl(locale, "/countries/[countryCode]", { countryCode }) }
        ]}
      />
    </div>
  );
}

/** Open and pilot countries: products, partner brokers, platform status and a local contact. */
async function OpenCountry({ locale, country, countryCode }: VariantProps) {
  const t = await getTranslations({ locale, namespace: "Country" });
  const common = await getTranslations({ locale, namespace: "Common" });
  const products = await listPublicProducts(countryCode);
  const partners = await listCountryPartners(countryCode);
  const visible = partners.data.slice(0, BROKERS_ON_COUNTRY_PAGE);

  return (
    <>
      <CountryBreadcrumb locale={locale} country={country} countryCode={countryCode} />

      <Hero title={t("title", { country: country.name })} lead={t("lead")}>
        {country.availability === "pilot" ? <Notice tone="info">{t("pilotNotice")}</Notice> : null}
      </Hero>

      <Section title={t("productsTitle")} lead={t("productsLead")}>
        {products.status === "error" ? (
          <EmptyState title={t("productsError.title")} description={t("productsError.description")} />
        ) : null}
        {products.status !== "error" && products.data.length === 0 ? (
          <EmptyState title={t("productsEmpty.title")} description={t("productsEmpty.description")} />
        ) : null}
        {products.data.length > 0 ? (
          <ul className="pub-cards pub-cards--two">
            {products.data.map((product) => {
              const productParams = { countryCode, productKey: product.key };
              return (
                <li className="pub-card" key={product.id}>
                  <h3 className="pub-card__title">
                    <Link href={{ pathname: "/countries/[countryCode]/products/[productKey]", params: productParams }}>
                      <BackendText>{product.name}</BackendText>
                    </Link>
                  </h3>
                  <p className="am-cluster">
                    <Badge tone={product.comparisonEnabled ? "new" : "soon"}>
                      {product.comparisonEnabled ? t("comparisonEnabled") : t("comparisonDisabled")}
                    </Badge>
                    <Badge tone={product.quoteEnabled ? "new" : "soon"}>
                      {product.quoteEnabled ? t("quoteEnabled") : t("quoteDisabled")}
                    </Badge>
                  </p>
                  <div className="am-cluster">
                    <Button
                      variant="secondary"
                      href={{ pathname: "/countries/[countryCode]/products/[productKey]", params: productParams }}
                    >
                      {t("viewProduct")}
                    </Button>
                    {product.comparisonEnabled ? (
                      <Button
                        href={{
                          pathname: "/countries/[countryCode]/products/[productKey]/offers",
                          params: productParams
                        }}
                      >
                        {t("compare")}
                      </Button>
                    ) : null}
                    {product.quoteEnabled ? (
                      <Button
                        variant="secondary"
                        href={{ pathname: "/countries/[countryCode]/products/[productKey]/quote", params: productParams }}
                      >
                        {t("quote")}
                      </Button>
                    ) : null}
                  </div>
                  {!product.comparisonEnabled ? <p className="am-field__hint">{t("comparisonHint")}</p> : null}
                  {!product.quoteEnabled ? <p className="am-field__hint">{t("quoteHint")}</p> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </Section>

      <Section title={t("brokersTitle")} lead={t("brokersLead")} tone="muted">
        {visible.length > 0 ? (
          <ul className="am-countrygrid">
            {visible.map((partner) => {
              const productLabels = partner.productKeys.map((key) => {
                const match = products.data.find((candidate) => candidate.key.toLowerCase() === key.toLowerCase());
                return match ? match.name : key;
              });
              return (
                <li key={partner.id}>
                  <BrokerBlock
                    displayName={partner.displayName}
                    licenceNumber={partner.licenseNumber}
                    issuingAuthority={partner.issuingAuthority}
                    labels={{
                      licenceNumber: common("licenceNumber"),
                      issuingAuthority: common("issuingAuthority"),
                      city: common("city"),
                      products: common("products"),
                      approved: common("approved")
                    }}
                    {...(partner.city ? { city: partner.city } : {})}
                    {...(productLabels.length > 0 ? { products: productLabels } : {})}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title={t("brokersEmpty.title")} description={t("brokersEmpty.description")} />
        )}
        <div className="am-cluster">
          <Button
            variant="secondary"
            href={{ pathname: "/countries/[countryCode]/brokers", params: { countryCode } }}
            iconAfter={<Icon name="arrow-right" size={20} />}
          >
            {t("brokersAll")}
          </Button>
        </div>
      </Section>

      <Section title={t("contactTitle")} lead={t("contactLead")}>
        <PlatformStatusNotice />
        <CountryContact country={country} whatsappLabel={t("whatsapp")} callLabel={(phone) => t("call", { phone })} />
        <Notice tone="indicative">{t("fineprint")}</Notice>
      </Section>
    </>
  );
}

/**
 * Per-country contact details.
 *
 * `PublicCountryDirectoryItem` carries no phone or WhatsApp number today, so the block reads the
 * optional fields defensively and renders nothing when the country entry does not expose one.
 * A public partner never carries a phone or WhatsApp number either: the backend deliberately
 * excludes them from `PublicPartnerSummary`, so this block cannot fall back to a listed partner
 * for contact details. Publishing a per-country contact on the directory entry is a backend
 * follow-up; the moment `whatsapp` or `phone` lands on it, this block picks it up unchanged.
 */
function CountryContact({
  country,
  whatsappLabel,
  callLabel
}: {
  country: PublicCountryDirectoryItem;
  whatsappLabel: string;
  callLabel: (phone: string) => string;
}) {
  const entry = country as PublicCountryDirectoryItem & { whatsapp?: unknown; phone?: unknown };
  const whatsapp = typeof entry.whatsapp === "string" && entry.whatsapp.trim() ? entry.whatsapp.trim() : undefined;
  const phone = typeof entry.phone === "string" && entry.phone.trim() ? entry.phone.trim() : undefined;
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

/** Waiting-list variant: no offer, no quote, only a subscription to the opening of the country. */
async function WaitingCountry({ locale, country, countryCode }: VariantProps) {
  const t = await getTranslations({ locale, namespace: "Waitlist" });
  const countries = await getTranslations({ locale, namespace: "Countries" });
  const products = await listPublicProducts(countryCode);
  const productOptions: WaitlistProductOption[] = products.data.map((product) => ({
    key: product.key,
    name: product.name
  }));
  const directory = await listCountryDirectory();
  const open = directory.data.filter((entry) => entry.availability !== "waitlist").slice(0, 8);

  return (
    <>
      <CountryBreadcrumb locale={locale} country={country} countryCode={countryCode} />

      <Hero kicker={t("badge")} title={t("heading", { country: country.name })} lead={t("lead")} />

      <Section>
        <p>{t("explanation", { country: country.name })}</p>
        <Notice tone="info">{t("noQuote")}</Notice>
        <PlatformStatusNotice />
      </Section>

      <Section title={t("form.legend")} tone="brand">
        <WaitlistForm
          countryIso={country.isoCode}
          products={productOptions}
          labels={{
            legend: t("form.legend"),
            email: t("form.email"),
            emailHint: t("form.emailHint"),
            emailRequired: t("form.emailRequired"),
            product: t("form.product"),
            productHint: t("form.productHint"),
            productNone: t("form.productNone"),
            consent: t("form.consent"),
            consentRequired: t("form.consentRequired"),
            website: t("form.website"),
            submit: t("form.submit"),
            submitting: t("form.submitting"),
            successTitle: t("form.successTitle"),
            successDescription: t("form.successDescription"),
            error: t("form.error")
          }}
        />
      </Section>

      {open.length > 0 ? (
        <Section title={t("openCountriesTitle")} lead={t("openCountriesLead")} tone="muted">
          <ul className="am-countrygrid">
            {open.map((entry) => (
              <li className="am-countrycard" key={entry.isoCode}>
                <h3 className="pub-card__title">
                  <Link href={{ pathname: "/countries/[countryCode]", params: { countryCode: entry.isoCode } }}>
                    <BackendText>{entry.name}</BackendText>
                  </Link>
                </h3>
                <p>
                  <Badge tone={entry.availability === "pilot" ? "pilot" : "new"}>
                    {countries(`availability.${entry.availability}`)}
                  </Badge>
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
