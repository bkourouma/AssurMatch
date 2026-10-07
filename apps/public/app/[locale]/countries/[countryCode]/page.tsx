import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "../../../../i18n/navigation";
import { toLocale, type AppLocale } from "../../../../i18n/routing";
import { WaitlistForm, type WaitlistProductOption } from "../../../components/forms/waitlist-form";
import { JourneyRoute } from "../../../components/journey/journey-route";
import { InitialsTile, IsoTile } from "../../../components/journey/tiles";
import { PlatformStatusNotice } from "../../../components/site/platform-status-notice";
import { BackendText } from "../../../components/ui/backend-text";
import { Badge } from "../../../components/ui/badge";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { Directory, type DirectoryItem } from "../../../components/ui/directory";
import { EmptyState } from "../../../components/ui/empty-state";
import { Hero } from "../../../components/ui/hero";
import { Icon } from "../../../components/ui/icons";
import { Notice } from "../../../components/ui/notice";
import { productPictogram } from "../../../components/ui/pictogram";
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
 *
 * The open variant opens on the navy sign of the journey (« Vous êtes ici : Pays ») carrying the
 * products as directory rows, the page's one main action: one row, one destination (the product
 * page, which holds both "compare" and "quote"). The direct shortcuts to the offers and to the quote
 * request stay one tap away in a short line under the rows.
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

/**
 * The trail of the page. On the open variant the journey strip takes its place on screen and the
 * trail stays for assistive technologies and its structured data; the waiting variant shows it.
 */
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

/** Open and pilot countries: products, partner brokers, platform status and a local contact. */
async function OpenCountry({ locale, country, countryCode }: VariantProps) {
  const t = await getTranslations({ locale, namespace: "Country" });
  const common = await getTranslations({ locale, namespace: "Common" });
  const countries = await getTranslations({ locale, namespace: "Countries" });
  const products = await listPublicProducts(countryCode);
  const partners = await listCountryPartners(countryCode);
  const visible = partners.data.slice(0, BROKERS_ON_COUNTRY_PAGE);

  // One row, one destination: the product page. What the product is open for is the row's line;
  // a capability that is switched off is said in full rather than left out.
  const productRows: DirectoryItem[] = products.data.map((product) => {
    const capabilities = [
      product.comparisonEnabled ? countries("capability.comparison") : null,
      product.quoteEnabled ? countries("capability.quote") : null
    ].filter((line): line is string => line !== null);
    const hints = [
      product.comparisonEnabled ? null : t("comparisonHint"),
      product.quoteEnabled ? null : t("quoteHint")
    ].filter((line): line is string => line !== null);
    return {
      key: product.id,
      title: <BackendText>{product.name}</BackendText>,
      meta: (
        <>
          {capabilities.length > 0 ? <span className="am-j-rowline">{capabilities.join(" · ")}</span> : null}
          {hints.map((hint) => (
            <span className="am-j-rowline" key={hint}>
              {hint}
            </span>
          ))}
        </>
      ),
      pictogram: productPictogram(product.key),
      href: { pathname: "/countries/[countryCode]/products/[productKey]", params: { countryCode, productKey: product.key } }
    };
  });
  const comparable = products.data.filter((product) => product.comparisonEnabled);
  const quotable = products.data.filter((product) => product.quoteEnabled);

  const brokerRows: DirectoryItem[] = visible.map((partner) => {
    const productLabels = partner.productKeys.map((key) => {
      const match = products.data.find((candidate) => candidate.key.toLowerCase() === key.toLowerCase());
      return match ? match.name : key;
    });
    return {
      key: partner.id,
      tile: <InitialsTile name={partner.displayName} />,
      title: (
        <>
          <BackendText>{partner.displayName}</BackendText>{" "}
          <Badge tone="approved" icon={<Icon name="badge-check" size={16} />}>
            {common("approved")}
          </Badge>
        </>
      ),
      meta: (
        <>
          <span className="am-j-rowline">
            {common("licenceNumber")} <BackendText>{partner.licenseNumber}</BackendText>
            {" - "}
            {common("issuingAuthority")} <BackendText>{partner.issuingAuthority}</BackendText>
            {partner.city ? (
              <>
                {" - "}
                {common("city")} <BackendText>{partner.city}</BackendText>
              </>
            ) : null}
          </span>
          {productLabels.length > 0 ? (
            <span className="am-j-rowline">
              <strong>{common("products")}</strong> <BackendText>{productLabels.join(", ")}</BackendText>
            </span>
          ) : null}
        </>
      ),
      href: { pathname: "/countries/[countryCode]/brokers/[partnerId]", params: { countryCode, partnerId: partner.id } }
    };
  });

  return (
    <>
      <Hero
        className="am-j-sign"
        title={t("title", { country: country.name, preposition: countryPreposition(country.isoCode) })}
        lead={countryHeroLead(t, country.isoCode)}
        route={<JourneyRoute current="country" countryCode={countryCode} />}
        breadcrumb={<CountryBreadcrumb locale={locale} country={country} countryCode={countryCode} />}
      >
        {country.availability === "pilot" ? <Notice tone="info">{t("pilotNotice")}</Notice> : null}

        <div className="am-j-signlist">
          <h2 className="am-j-signlist__title">{t("productsTitle")}</h2>
          <p className="am-j-signlist__lead">{t("productsLead")}</p>
          {products.status === "error" ? (
            <EmptyState icon="wifi-off" title={t("productsError.title")} description={t("productsError.description")} />
          ) : null}
          {products.status !== "error" && products.data.length === 0 ? (
            <EmptyState icon="package" title={t("productsEmpty.title")} description={t("productsEmpty.description")} />
          ) : null}
          <Directory items={productRows} label={t("productsTitle")} columns={2} surface="plate" />
          {comparable.length > 0 || quotable.length > 0 ? (
            <ul className="am-j-shortcuts">
              {comparable.length > 0 ? (
                <li>
                  <span className="am-j-shortcuts__label">{t("compare")}</span>
                  {comparable.map((product) => (
                    <Link
                      key={product.id}
                      href={{
                        pathname: "/countries/[countryCode]/products/[productKey]/offers",
                        params: { countryCode, productKey: product.key }
                      }}
                    >
                      <BackendText>{product.name}</BackendText>
                    </Link>
                  ))}
                </li>
              ) : null}
              {quotable.length > 0 ? (
                <li>
                  <span className="am-j-shortcuts__label">{t("quote")}</span>
                  {quotable.map((product) => (
                    <Link
                      key={product.id}
                      href={{
                        pathname: "/countries/[countryCode]/products/[productKey]/quote",
                        params: { countryCode, productKey: product.key }
                      }}
                    >
                      <BackendText>{product.name}</BackendText>
                    </Link>
                  ))}
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </Hero>

      <Section title={t("brokersTitle")} lead={t("brokersLead")} tone="muted">
        {brokerRows.length > 0 ? (
          <>
            <Directory items={brokerRows} label={t("brokersTitle")} />
            <p className="am-j-morelink">
              <Link href={{ pathname: "/countries/[countryCode]/brokers", params: { countryCode } }}>
                {t("brokersAll")}
                <Icon name="arrow-right" size={18} />
              </Link>
            </p>
          </>
        ) : (
          <EmptyState icon="users" title={t("brokersEmpty.title")} description={t("brokersEmpty.description")} />
        )}
      </Section>

      <CountryClosing
        country={country}
        title={t("contactTitle")}
        lead={t("contactLead")}
        fineprint={t("fineprint")}
        whatsappLabel={t("whatsapp")}
        callLabel={(phone) => t("call", { phone })}
      />
    </>
  );
}

/**
 * Per-country contact details and the platform status.
 *
 * `PublicCountryDirectoryItem` carries no phone or WhatsApp number today, so the block reads the
 * optional fields defensively. A public partner never carries a phone or WhatsApp number either: the
 * backend deliberately excludes them from `PublicPartnerSummary`, so this block cannot fall back to a
 * listed partner for contact details. Publishing a per-country contact on the directory entry is a
 * backend follow-up; the moment `whatsapp` or `phone` lands on it, the "Contact local" heading and
 * its buttons appear unchanged. Until then the section carries only the platform status and the
 * indicative notice, without a heading that would promise a contact it cannot show.
 */
function CountryClosing({
  country,
  title,
  lead,
  fineprint,
  whatsappLabel,
  callLabel
}: {
  country: PublicCountryDirectoryItem;
  title: string;
  lead: string;
  fineprint: string;
  whatsappLabel: string;
  callLabel: (phone: string) => string;
}) {
  const entry = country as PublicCountryDirectoryItem & { whatsapp?: unknown; phone?: unknown };
  const whatsapp = typeof entry.whatsapp === "string" && entry.whatsapp.trim() ? entry.whatsapp.trim() : undefined;
  const phone = typeof entry.phone === "string" && entry.phone.trim() ? entry.phone.trim() : undefined;
  const hasContact = Boolean(whatsapp || phone);

  return (
    <Section {...(hasContact ? { title, lead } : {})}>
      <div className="am-stack am-stack--lg am-j-measure">
        {hasContact ? (
          <div className="am-cluster">
            {whatsapp ? <WhatsAppButton phone={whatsapp} label={whatsappLabel} /> : null}
            {phone ? (
              <a className="am-button" data-variant="secondary" href={`tel:${phone.replace(/[^+\d]/g, "")}`}>
                <Icon name="phone" size={20} />
                <span>{callLabel(phone)}</span>
              </a>
            ) : null}
          </div>
        ) : null}
        <PlatformStatusNotice />
        <Notice tone="indicative">{fineprint}</Notice>
      </div>
    </Section>
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

/**
 * Waiting-list variant: no offer, no quote, only a subscription to the opening of the country. The
 * subscription plate sits on the sign, as the page's one action; the journey strip is not shown,
 * because no journey goes further than this page while the country is closed.
 */
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

  const openRows: DirectoryItem[] = open.map((entry) => ({
    key: entry.isoCode,
    tile: <IsoTile isoCode={entry.isoCode} />,
    title: <BackendText>{entry.name}</BackendText>,
    meta: countries(`availability.${entry.availability}`),
    href: { pathname: "/countries/[countryCode]", params: { countryCode: entry.isoCode } }
  }));

  return (
    <>
      <Hero
        title={t("heading", { country: country.name })}
        lead={t("lead")}
        breadcrumb={<CountryBreadcrumb locale={locale} country={country} countryCode={countryCode} />}
        aside={
          <div className="am-entry am-j-waitlist">
            <h2 className="am-entry__title">{t("form.legend")}</h2>
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
        }
      />

      <Section ariaLabel={t("description")}>
        <div className="am-stack am-stack--lg am-j-measure">
          <p className="am-lead">{t("explanation", { country: country.name })}</p>
          <p className="am-j-statement">
            <Icon name="info" size={20} />
            <span>{t("noQuote")}</span>
          </p>
          <PlatformStatusNotice />
        </div>
      </Section>

      {openRows.length > 0 ? (
        <Section title={t("openCountriesTitle")} lead={t("openCountriesLead")} tone="muted">
          <Directory items={openRows} label={t("openCountriesTitle")} columns={2} />
        </Section>
      ) : null}
    </>
  );
}
