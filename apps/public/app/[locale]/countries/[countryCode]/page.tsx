import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "../../../../i18n/navigation";
import { toLocale, type AppLocale } from "../../../../i18n/routing";
import { WaitlistForm, type WaitlistProductOption } from "../../../components/forms/waitlist-form";
import { CountryFlag } from "../../../components/journey/country-flag";
import { productIcon } from "../../../components/journey/product-icon";
import { PlatformStatusNotice } from "../../../components/site/platform-status-notice";
import { BackendText } from "../../../components/ui/backend-text";
import { Badge } from "../../../components/ui/badge";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { BrokerBlock } from "../../../components/ui/broker-block";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/empty-state";
import { Hero } from "../../../components/ui/hero";
import { Icon } from "../../../components/ui/icons";
import { IconTile } from "../../../components/ui/icon-tile";
import { Notice } from "../../../components/ui/notice";
import { Reveal } from "../../../components/motion/reveal";
import { Section } from "../../../components/ui/section";
import { WhatsAppButton } from "../../../components/ui/whatsapp-button";
import {
  listCountryDirectory,
  listCountryPartners,
  listPublicProducts,
  submitWaitlist,
  type PublicCountryDirectoryItem
} from "../../../lib/public-api";
import { buildMetadata, localePath, localeUrl } from "../../../lib/seo";
import type { PageMetadata } from "../../../lib/seo";

/**
 * Country page (SITE-108) and its waiting-list variant (SITE-109).
 *
 * The country is resolved through the public directory: a country the directory does not know is a
 * 404. A country whose availability is `waitlist` renders an indexable-free waiting page with no
 * path to a quote at all, because no partner broker is authorised there yet.
 */

type PageParams = { locale: string; countryCode: string };
type SearchParams = Record<string, string | string[] | undefined>;

const BROKERS_ON_COUNTRY_PAGE = 3;
const KNOWN_WAITLIST_ERROR_KEYS = ["waitlistFailed", "rateLimited", "apiUnavailable"] as const;
type KnownWaitlistErrorKey = (typeof KNOWN_WAITLIST_ERROR_KEYS)[number];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Grammatical preposition preceding the country name ("Assurance en Côte d'Ivoire", "Assurance au
 * Sénégal"). Defaults to "en" for every country not listed here; add an entry only when a country
 * genuinely takes "au" (or another preposition) in French.
 */
const COUNTRY_PREPOSITIONS: Record<string, string> = { SN: "au" };

function countryPreposition(isoCode: string): string {
  return COUNTRY_PREPOSITIONS[isoCode.trim().toUpperCase()] ?? "en";
}

/**
 * The hero subtitle of the open country page: CI and SN carry a subtitle written specifically for
 * them (content/01, page pays); every other country falls back to the generic `Country.lead`. The
 * two literal keys below (rather than a template built from `isoCode`, which is a plain `string`)
 * are what let this stay checked against the generated message types.
 */
function countryHeroLead(t: (key: "lead" | "variants.CI.lead" | "variants.SN.lead") => string, isoCode: string): string {
  const code = isoCode.trim().toUpperCase();
  if (code === "CI") return t("variants.CI.lead");
  if (code === "SN") return t("variants.SN.lead");
  return t("lead");
}

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
  const iso = country?.isoCode ?? countryCode;
  return buildMetadata({
    title: t("title", { country: name, preposition: countryPreposition(iso) }),
    description: t("description", { country: name }),
    href: "/countries/[countryCode]",
    params: { countryCode },
    locale
  });
}

export default async function PublicCountryPage({
  params,
  searchParams
}: {
  params: Promise<PageParams>;
  searchParams?: Promise<SearchParams>;
}) {
  const { locale: rawLocale, countryCode } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);

  const country = await resolveCountry(countryCode);
  if (!country) notFound();

  const query = searchParams ? await searchParams : {};

  return country.availability === "waitlist" ? (
    <WaitingCountry locale={locale} country={country} countryCode={countryCode} query={query} />
  ) : (
    <OpenCountry locale={locale} country={country} countryCode={countryCode} />
  );
}

interface VariantProps {
  locale: AppLocale;
  country: PublicCountryDirectoryItem;
  countryCode: string;
}

/** Rendered through the hero's `breadcrumb` slot, so the trail sits inside the opening band. */
async function CountryBreadcrumb({ locale, country, countryCode }: VariantProps) {
  const common = await getTranslations({ locale, namespace: "Common" });
  const countries = await getTranslations({ locale, namespace: "Countries" });
  return (
    <Breadcrumb
      label={common("breadcrumbLabel")}
      items={[
        { name: common("home"), url: localeUrl(locale, "/") },
        { name: countries("breadcrumb"), url: localeUrl(locale, "/countries") },
        { name: country.name, url: localeUrl(locale, "/countries/[countryCode]", { countryCode }) }
      ]}
    />
  );
}

/** Flag, name, availability and what the country is open for: the hero's second column. */
async function CountryIdentityCard({ locale, country }: { locale: AppLocale; country: PublicCountryDirectoryItem }) {
  const countries = await getTranslations({ locale, namespace: "Countries" });
  const tone = country.availability === "pilot" ? "pilot" : country.availability === "waitlist" ? "soon" : "new";

  return (
    <div className="am-j-countrycard">
      <div className="am-j-countrycard__head">
        <CountryFlag isoCode={country.isoCode} size="lg" />
        <div>
          <p className="am-j-countrycard__name">
            <BackendText>{country.name}</BackendText>
          </p>
          <Badge tone={tone}>{countries(`availability.${country.availability}`)}</Badge>
        </div>
      </div>
      <ul className="am-pill-list">
        {country.comparisonEnabled ? (
          <li className="am-pill">
            <Icon name="scale" size={16} />
            {countries("capability.comparison")}
          </li>
        ) : null}
        {country.quoteEnabled ? (
          <li className="am-pill">
            <Icon name="file-text" size={16} />
            {countries("capability.quote")}
          </li>
        ) : null}
        {country.currency ? (
          <li className="am-pill">
            <Icon name="coins" size={16} />
            <BackendText>{country.currency}</BackendText>
          </li>
        ) : null}
      </ul>
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
      <Hero
        kicker={t("kicker")}
        title={t("title", { country: country.name, preposition: countryPreposition(country.isoCode) })}
        lead={countryHeroLead(t, country.isoCode)}
        breadcrumb={<CountryBreadcrumb locale={locale} country={country} countryCode={countryCode} />}
        aside={<CountryIdentityCard locale={locale} country={country} />}
      >
        {country.availability === "pilot" ? <Notice tone="info">{t("pilotNotice")}</Notice> : null}
      </Hero>

      <Section title={t("productsTitle")} lead={t("productsLead")}>
        {products.status === "error" ? (
          <EmptyState icon="wifi-off" tone="muted" title={t("productsError.title")} description={t("productsError.description")} />
        ) : null}
        {products.status !== "error" && products.data.length === 0 ? (
          <EmptyState icon="package" tone="muted" title={t("productsEmpty.title")} description={t("productsEmpty.description")} />
        ) : null}
        {products.data.length > 0 ? (
          <Reveal as="ul" stagger className="am-j-products">
            {products.data.map((product) => {
              const productParams = { countryCode, productKey: product.key };
              return (
                <li className="am-j-product" key={product.id}>
                  <div className="am-j-product__head">
                    <IconTile name={productIcon(product.key)} size="lg" />
                    <h3 className="am-j-product__title">
                      <Link href={{ pathname: "/countries/[countryCode]/products/[productKey]", params: productParams }}>
                        <BackendText>{product.name}</BackendText>
                      </Link>
                    </h3>
                  </div>
                  <div className="am-cluster">
                    <Badge tone={product.comparisonEnabled ? "new" : "soon"}>
                      {product.comparisonEnabled ? t("comparisonEnabled") : t("comparisonDisabled")}
                    </Badge>
                    <Badge tone={product.quoteEnabled ? "new" : "soon"}>
                      {product.quoteEnabled ? t("quoteEnabled") : t("quoteDisabled")}
                    </Badge>
                  </div>
                  {!product.comparisonEnabled ? <p className="am-j-product__hint">{t("comparisonHint")}</p> : null}
                  {!product.quoteEnabled ? <p className="am-j-product__hint">{t("quoteHint")}</p> : null}
                  <div className="am-j-product__actions">
                    {product.comparisonEnabled ? (
                      <Button
                        href={{
                          pathname: "/countries/[countryCode]/products/[productKey]/offers",
                          params: productParams
                        }}
                        icon={<Icon name="scale" size={18} />}
                      >
                        {t("compare")}
                      </Button>
                    ) : null}
                    <Button
                      variant="secondary"
                      href={{ pathname: "/countries/[countryCode]/products/[productKey]", params: productParams }}
                    >
                      {t("viewProduct")}
                    </Button>
                    {product.quoteEnabled ? (
                      <Button
                        variant="tertiary"
                        href={{ pathname: "/countries/[countryCode]/products/[productKey]/quote", params: productParams }}
                      >
                        {t("quote")}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </Reveal>
        ) : null}
      </Section>

      <Section
        title={t("brokersTitle")}
        lead={t("brokersLead")}
        tone="muted"
        actions={
          <Button
            variant="secondary"
            href={{ pathname: "/countries/[countryCode]/brokers", params: { countryCode } }}
            iconAfter={<Icon name="arrow-right" size={20} />}
          >
            {t("brokersAll")}
          </Button>
        }
      >
        {visible.length > 0 ? (
          <Reveal as="ul" stagger className="am-j-cardgrid">
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
                    approved
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
          </Reveal>
        ) : (
          <EmptyState icon="users" tone="muted" title={t("brokersEmpty.title")} description={t("brokersEmpty.description")} />
        )}
      </Section>

      <Section title={t("contactTitle")} lead={t("contactLead")}>
        <div className="am-stack am-stack--lg">
          <PlatformStatusNotice />
          <CountryContact country={country} whatsappLabel={t("whatsapp")} callLabel={(phone) => t("call", { phone })} />
          <Notice tone="indicative">{t("fineprint")}</Notice>
        </div>
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

/**
 * D6: the browser's native submission of the waiting-list form (no JavaScript) posts here directly.
 * With JavaScript, `WaitlistForm` calls `preventDefault()` in its own submit handler and this action is
 * never reached. On success it redirects back to this same country page with `?sent=1` (never any
 * personal data); on failure with `?formError=<key>` mapped to the same localized copy the client shows.
 */
async function submitWaitlistAction(
  boundLocale: AppLocale,
  boundCountryCode: string,
  boundCountryIso: string,
  formData: FormData
): Promise<void> {
  "use server";
  const countryPathname = "/countries/[countryCode]" as const;
  const backToCountry = (errorKey: string): never => {
    redirect(`${localePath(boundLocale, countryPathname, { countryCode: boundCountryCode })}?formError=${encodeURIComponent(errorKey)}`);
  };

  if (formData.get("consent") !== "on") {
    backToCountry("consent");
  }

  const email = String(formData.get("email") ?? "").trim();
  const productKey = String(formData.get("productKey") ?? "").trim();
  // Honeypot: a real visitor never fills this field. It is forwarded as-is so the public API's abuse
  // guard rejects the submission exactly as it does for a JavaScript-driven one.
  const website = String(formData.get("website") ?? "").trim();

  if (!email) {
    backToCountry("emailRequired");
  }

  const incoming = await headers();
  const forwardedFor = incoming.get("x-forwarded-for")?.split(",")[0]?.trim() || incoming.get("x-real-ip")?.trim() || undefined;

  const response = await submitWaitlist(
    {
      countryCode: boundCountryIso,
      email,
      consent: true,
      // The no-JavaScript path must pick the confirmation e-mail language like the client form does.
      locale: boundLocale,
      ...(website ? { website } : {}),
      ...(productKey ? { productKey } : {})
    },
    { forwardedFor }
  );

  if (response.status !== "success") {
    backToCountry(response.messageKey ?? "waitlistFailed");
    return;
  }

  redirect(`${localePath(boundLocale, countryPathname, { countryCode: boundCountryCode })}?sent=1`);
}

/** Waiting-list variant: no offer, no quote, only a subscription to the opening of the country. */
async function WaitingCountry({ locale, country, countryCode, query }: VariantProps & { query: SearchParams }) {
  const t = await getTranslations({ locale, namespace: "Waitlist" });
  const countries = await getTranslations({ locale, namespace: "Countries" });
  const api = await getTranslations({ locale, namespace: "Api" });
  const products = await listPublicProducts(countryCode);
  const productOptions: WaitlistProductOption[] = products.data.map((product) => ({
    key: product.key,
    name: product.name
  }));
  const directory = await listCountryDirectory();
  const open = directory.data.filter((entry) => entry.availability !== "waitlist").slice(0, 8);

  const sent = first(query.sent) === "1";
  const formErrorParam = first(query.formError);
  const formErrorText =
    formErrorParam === "consent"
      ? t("form.consentRequired")
      : formErrorParam === "emailRequired"
        ? t("form.emailRequired")
        : formErrorParam && (KNOWN_WAITLIST_ERROR_KEYS as readonly string[]).includes(formErrorParam)
          ? api(formErrorParam as KnownWaitlistErrorKey)
          : undefined;

  const boundSubmitWaitlistAction = submitWaitlistAction.bind(null, locale, countryCode, country.isoCode);

  return (
    <>
      <Hero
        kicker={t("badge")}
        title={t("heading", { country: country.name })}
        lead={t("lead")}
        breadcrumb={<CountryBreadcrumb locale={locale} country={country} countryCode={countryCode} />}
        aside={<CountryIdentityCard locale={locale} country={country} />}
      />

      <Section title={t("form.legend")}>
        <div className="am-j-waitlist">
          <div className="am-stack am-stack--lg">
            <p className="am-lead">{t("explanation", { country: country.name })}</p>
            <Notice tone="info">{t("noQuote")}</Notice>
            <PlatformStatusNotice />
          </div>
          <div className="am-j-waitlist__form">
            {sent ? (
              <Notice tone="success" title={t("form.successTitle")} role="status">
                {t("form.successDescription")}
              </Notice>
            ) : (
              <>
                {formErrorText ? (
                  <Notice tone="error" role="alert">
                    {formErrorText}
                  </Notice>
                ) : null}
                <WaitlistForm
                  countryIso={country.isoCode}
                  products={productOptions}
                  formAction={boundSubmitWaitlistAction}
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
              </>
            )}
          </div>
        </div>
      </Section>

      {open.length > 0 ? (
        <Section title={t("openCountriesTitle")} lead={t("openCountriesLead")} tone="muted">
          <Reveal as="ul" stagger className="am-j-countries">
            {open.map((entry) => (
              <li className="am-j-country" key={entry.isoCode}>
                <div className="am-j-country__head">
                  <CountryFlag isoCode={entry.isoCode} />
                  <h3 className="am-j-country__name">
                    <Link href={{ pathname: "/countries/[countryCode]", params: { countryCode: entry.isoCode } }}>
                      <BackendText>{entry.name}</BackendText>
                    </Link>
                  </h3>
                  <span className="am-j-country__arrow">
                    <Icon name="arrow-right" size={20} />
                  </span>
                </div>
                <div className="am-cluster">
                  <Badge tone={entry.availability === "pilot" ? "pilot" : "new"}>
                    {countries(`availability.${entry.availability}`)}
                  </Badge>
                </div>
              </li>
            ))}
          </Reveal>
        </Section>
      ) : null}
    </>
  );
}
