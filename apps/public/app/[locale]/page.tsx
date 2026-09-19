import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "../../i18n/navigation";
import { toLocale } from "../../i18n/routing";
import { EntrySelector, type EntrySelectorProduct } from "../components/site/entry-selector";
import { PlatformStatusNotice } from "../components/site/platform-status-notice";
import { Breadcrumb } from "../components/ui/breadcrumb";
import { Button } from "../components/ui/button";
import { Hero } from "../components/ui/hero";
import { Icon } from "../components/ui/icons";
import { Notice } from "../components/ui/notice";
import { Section } from "../components/ui/section";
import { formatDate } from "../lib/country-format";
import { getPublicStats, listPublicProducts } from "../lib/public-api";
import type { PublicStats } from "../lib/public-api";
import { buildMetadata, localeUrl } from "../lib/seo";
import type { PageMetadata } from "../lib/seo";
import { readVisitorCountry } from "../lib/visitor-country";

/**
 * Public home page (SITE-101 to SITE-106).
 *
 * The visitor country is a default, never a redirection: it pre-selects the entry form and the page
 * says so in as many words. Every figure comes from `GET /public-stats`; nothing is hard-coded.
 */

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Home" });
  return buildMetadata({ title: t("title"), description: t("metaDescription"), href: "/", locale });
}

/**
 * `GET /public-stats` is being finalised in parallel and the two candidate shapes differ
 * (`openCountries`/`activeBrokers`/`validatedOffers` on the contract, `countries`/`partners`/
 * `offers` on the current reader). Reading by a list of accepted names keeps the counters correct
 * whichever one answers, and returns nothing rather than a placeholder when neither is present.
 */
/**
 * The counters come straight from `GET /public-stats`, whose shape is fixed by the shared contract.
 * A value is rendered only when the endpoint really sent a finite number, so a partial or degraded
 * response shows fewer counters rather than a zero the catalogue never reported.
 */
function statValue(source: PublicStats | null, key: "openCountries" | "activeBrokers" | "validatedOffers"): number | undefined {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function statDate(source: PublicStats | null): string | undefined {
  return typeof source?.computedAt === "string" ? source.computedAt : undefined;
}

export default async function PublicHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const common = await getTranslations("Common");

  const visitor = await readVisitorCountry();
  const selectable = visitor.directory.filter((country) => country.availability !== "waitlist");
  const preselected = selectable.find((country) => country.isoCode === visitor.isoCode) ?? selectable[0];
  const products = preselected ? (await listPublicProducts(preselected.isoCode)).data : [];
  const entryProducts: EntrySelectorProduct[] = products.map((product) => ({
    key: product.key,
    name: product.name,
    ...(preselected ? { countryIso: preselected.isoCode } : {})
  }));

  const stats = await getPublicStats();
  const counters =
    stats.status === "success"
      ? [
          { key: "countries", label: t("stats.countries"), value: statValue(stats.data, "openCountries") },
          { key: "partners", label: t("stats.partners"), value: statValue(stats.data, "activeBrokers") },
          { key: "offers", label: t("stats.offers"), value: statValue(stats.data, "validatedOffers") }
        ].filter((counter): counter is { key: string; label: string; value: number } => counter.value !== undefined)
      : [];
  const computedAt = stats.status === "success" ? statDate(stats.data) : undefined;
  const numbers = new Intl.NumberFormat(locale);

  return (
    <>
      <div className="am-container">
        <Breadcrumb label={common("breadcrumbLabel")} items={[{ name: t("breadcrumb"), url: localeUrl(locale, "/") }]} />
      </div>

      <Hero
        kicker={t("kicker")}
        title={t("title")}
        lead={t("lead")}
        actions={
          <Button href="/countries" icon={<Icon name="search" size={20} />}>
            {t("compare")}
          </Button>
        }
      >
        <p className="am-hero__lead">
          {preselected ? t("preselected", { country: preselected.name }) : t("preselectedNone")}
        </p>
        {selectable.length > 0 ? (
          <EntrySelector
            countries={selectable.map((country) => ({ isoCode: country.isoCode, name: country.name }))}
            products={entryProducts}
            defaultCountry={preselected?.isoCode ?? null}
          />
        ) : (
          <p className="am-hero__lead">{t("entryUnavailable")}</p>
        )}
      </Hero>

      {counters.length > 0 ? (
        <Section title={t("stats.title")} lead={t("stats.lead")} tone="muted">
          <dl className="am-countrygrid">
            {counters.map((counter) => (
              <div className="am-countrycard" key={counter.key}>
                <dt className="am-field__label">{counter.label}</dt>
                <dd className="am-broker__name">{numbers.format(counter.value)}</dd>
              </div>
            ))}
          </dl>
          {computedAt ? (
            <p className="am-field__hint">{t("stats.updatedAt", { date: formatDate(computedAt, { locale }) })}</p>
          ) : null}
          <p className="am-field__hint">{t("stats.indicative")}</p>
        </Section>
      ) : null}

      <Section title={t("statusTitle")} lead={t("statusLead")}>
        <PlatformStatusNotice />
        <p>{t("statusDetail")}</p>
        <div className="am-cluster">
          <Button href="/regulatory-status" variant="secondary" iconAfter={<Icon name="arrow-right" size={20} />}>
            {t("regulatoryLink")}
          </Button>
        </div>
        <p className="am-field__hint">{t("regulatoryLead")}</p>
      </Section>

      <Section title={t("stepsTitle")} lead={t("stepsLead")} tone="brand">
        <ol className="pub-steps">
          <li className="pub-step">
            <span className="pub-step__index" aria-hidden="true">
              1
            </span>
            <h3>{t("steps.compare.title")}</h3>
            <p>{t("steps.compare.description")}</p>
          </li>
          <li className="pub-step">
            <span className="pub-step__index" aria-hidden="true">
              2
            </span>
            <h3>{t("steps.quote.title")}</h3>
            <p>{t("steps.quote.description")}</p>
          </li>
          <li className="pub-step">
            <span className="pub-step__index" aria-hidden="true">
              3
            </span>
            <h3>{t("steps.broker.title")}</h3>
            <p>{t("steps.broker.description")}</p>
          </li>
        </ol>
        <div className="am-cluster">
          <Link href="/how-it-works">{t("stepsLink")}</Link>
        </div>
      </Section>

      <Section ariaLabel={t("signature")}>
        {/* Brand signature: the home page is the only surface that carries it. */}
        <p className="am-hero__title">{t("signature")}</p>
        <Notice tone="indicative">{t("fineprint")}</Notice>
      </Section>
    </>
  );
}
