import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../i18n/routing";
import { Link } from "../../i18n/navigation";
import { EntrySelector, type EntrySelectorProduct } from "../components/site/entry-selector";
import { PlatformStatusNotice } from "../components/site/platform-status-notice";
import { BackendText } from "../components/ui/backend-text";
import { Directory, type DirectoryItem } from "../components/ui/directory";
import { Hero } from "../components/ui/hero";
import { Icon } from "../components/ui/icons";
import { Notice } from "../components/ui/notice";
import { productPictogram } from "../components/ui/pictogram";
import { Route } from "../components/ui/route-line";
import { Section } from "../components/ui/section";
import { listGuides } from "../content/guides";
import { formatDate } from "../lib/country-format";
import { getPublicStats, listPublicProducts } from "../lib/public-api";
import type { PublicStats } from "../lib/public-api";
import { buildMetadata } from "../lib/seo";
import type { PageMetadata } from "../lib/seo";
import { readVisitorCountry } from "../lib/visitor-country";
import "../styles/pages/home.css";

/**
 * Public home page (SITE-101 to SITE-106), "La signalétique".
 *
 * The page opens on a navy sign: the visitor's country (a default, never a redirection, and the page
 * says so), the headline (the brand signature, spec 050 D3, in the visitor's imperative), the
 * positioning sentence, then the products open in that country as directory rows, which are the
 * main action. The page ends on the guides: no closing band repeats the headline. Every figure comes from `GET /public-stats`; nothing is
 * hard-coded. There is no breadcrumb on the home page: the location line takes its place.
 */

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Home" });
  return buildMetadata({ title: t("title"), description: t("metaDescription"), href: "/", locale });
}

/**
 * A value is rendered only when the endpoint really sent a finite number, so a partial or degraded
 * response shows fewer figures rather than a zero the catalogue never reported.
 */
function statValue(source: PublicStats | null, key: "openCountries" | "activeBrokers" | "validatedOffers"): number | undefined {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function statDate(source: PublicStats | null): string | undefined {
  return typeof source?.computedAt === "string" ? source.computedAt : undefined;
}

/** D-Chiffres: three zeros hide the whole block rather than pass for a real state of the platform. */
function allCountersZero(source: PublicStats | null): boolean {
  return statValue(source, "openCountries") === 0 && statValue(source, "activeBrokers") === 0 && statValue(source, "validatedOffers") === 0;
}

export default async function PublicHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const countriesT = await getTranslations("Countries");

  const visitor = await readVisitorCountry();
  const selectable = visitor.directory.filter((country) => country.availability !== "waitlist");
  const preselected = selectable.find((country) => country.isoCode === visitor.isoCode) ?? selectable[0];
  const products = preselected ? (await listPublicProducts(preselected.isoCode)).data : [];
  const entryProducts: EntrySelectorProduct[] = products.map((product) => ({
    key: product.key,
    name: product.name,
    ...(preselected ? { countryIso: preselected.isoCode } : {})
  }));

  const productRows: DirectoryItem[] = preselected
    ? products.map((product) => {
        const capabilities = [
          product.comparisonEnabled ? countriesT("capability.comparison") : null,
          product.quoteEnabled ? countriesT("capability.quote") : null
        ].filter((line): line is string => line !== null);
        return {
          key: product.key,
          title: <BackendText>{product.name}</BackendText>,
          meta: capabilities.length > 0 ? capabilities.join(" · ") : undefined,
          pictogram: productPictogram(product.key),
          href: {
            pathname: "/countries/[countryCode]/products/[productKey]",
            params: { countryCode: preselected.isoCode, productKey: product.key }
          }
        };
      })
    : [];

  // The figures are one information line, not a row of metric cards: each count is spelled with its
  // own plural ("1 pays ouvert", "3 courtiers partenaires actifs") and the line lists only the counts
  // the endpoint really sent.
  const stats = await getPublicStats();
  const figureParts =
    stats.status === "success" && !allCountersZero(stats.data)
      ? [
          { key: "countriesCount", value: statValue(stats.data, "openCountries") },
          { key: "partnersCount", value: statValue(stats.data, "activeBrokers") },
          { key: "offersCount", value: statValue(stats.data, "validatedOffers") }
        ]
          .filter((figure): figure is { key: "countriesCount" | "partnersCount" | "offersCount"; value: number } => figure.value !== undefined)
          .map((figure) => t(`stats.${figure.key}`, { count: figure.value }))
      : [];
  const figuresLine = figureParts.length > 0 ? new Intl.ListFormat(locale, { type: "conjunction" }).format(figureParts) : null;
  const computedAt = stats.status === "success" ? statDate(stats.data) : undefined;

  const does = [t("role.does.compare"), t("role.does.explain"), t("role.does.transmit"), t("role.does.flag")];
  const doesNot = [t("role.doesNot.sell"), t("role.doesNot.issue"), t("role.doesNot.collect"), t("role.doesNot.advise")];

  const guides = listGuides(locale).slice(0, 3);
  const guideRows: DirectoryItem[] = guides.map((guide) => ({
    key: guide.slug,
    title: guide.title,
    meta: guide.description,
    icon: "book-open",
    href: { pathname: "/guides/[slug]", params: { slug: guide.slug } }
  }));

  const location = (
    <p className="am-home-location">
      <Icon name="map-pin" size={20} />
      {preselected ? (
        <strong>
          <BackendText>{preselected.name}</BackendText>
        </strong>
      ) : null}
      <Link href="/countries">{t("changeCountry")}</Link>
    </p>
  );

  return (
    <>
      <Hero className="am-home-sign" size="lg" title={t("title")} lead={t("lead")} breadcrumb={location}>
        {productRows.length > 0 ? (
          <div className="am-home-products">
            <h2 className="am-home-products__title">{t("productsTitle")}</h2>
            <Directory items={productRows} label={t("productsTitle")} columns={2} surface="plate" />
            <p className="am-home-products__note">{preselected ? t("preselected", { country: preselected.name }) : t("preselectedNone")}</p>
          </div>
        ) : selectable.length > 0 ? (
          <EntrySelector
            title={t("entryTitle")}
            countries={selectable.map((country) => ({ isoCode: country.isoCode, name: country.name }))}
            products={entryProducts}
            defaultCountry={preselected?.isoCode ?? null}
          />
        ) : (
          <Notice tone="info">{t("entryUnavailable")}</Notice>
        )}
      </Hero>

      {productRows.length > 0 && selectable.length > 0 ? (
        <section className="am-home-entry" aria-label={t("entryOther")}>
          <div className="am-container">
            <EntrySelector
              title={t("entryOther")}
              countries={selectable.map((country) => ({ isoCode: country.isoCode, name: country.name }))}
              products={entryProducts}
              defaultCountry={preselected?.isoCode ?? null}
            />
          </div>
        </section>
      ) : null}

      <Section tone="muted" title={t("stepsTitle")} lead={t("stepsLead")}>
        <Route
          stops={[
            { key: "compare", title: t("steps.compare.title"), body: t("steps.compare.description") },
            { key: "quote", title: t("steps.quote.title"), body: t("steps.quote.description") },
            { key: "broker", title: t("steps.broker.title"), body: t("steps.broker.description"), state: "confirm" }
          ]}
        />
        <p className="am-home-more">
          <Link href="/how-it-works">
            {t("stepsLink")}
            <Icon name="arrow-right" size={18} />
          </Link>
        </p>
      </Section>

      <Section title={t("statusTitle")} lead={t("statusLead")}>
        <div className="am-home-role">
          <div className="am-home-role__group">
            <h3 className="am-home-role__title">{t("role.does.title")}</h3>
            <ul className="am-home-role__list" data-tone="does">
              {does.map((line) => (
                <li key={line}>
                  <Icon name="check" size={20} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="am-home-role__group">
            <h3 className="am-home-role__title">{t("role.doesNot.title")}</h3>
            <ul className="am-home-role__list" data-tone="doesnot">
              {doesNot.map((line) => (
                <li key={line}>
                  <Icon name="minus" size={20} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="am-home-status">
          <PlatformStatusNotice />
          <p className="am-home-status__note">{t("fineprint")}</p>
          <ul className="am-home-status__links">
            <li>
              <Link href="/regulatory-status">{t("regulatoryLink")}</Link>
            </li>
            <li>
              <Link href="/our-commitment">{t("commitmentLink")}</Link>
            </li>
          </ul>
        </div>

        {figuresLine ? (
          <p className="am-home-figures">
            <strong>{t("stats.lineLabel")}</strong> <span className="am-tabular">{figuresLine}.</span>{" "}
            <span className="am-home-figures__note">
              {`${t("stats.lead")} `}
              {computedAt ? `${t("stats.updatedAt", { date: formatDate(computedAt, { locale }) })} ` : null}
              {t("stats.indicative")}
            </span>
          </p>
        ) : null}
      </Section>

      {guideRows.length > 0 ? (
        <Section tone="muted" title={t("guides.title")} lead={t("guides.lead")}>
          <Directory items={guideRows} label={t("guides.title")} />
          <p className="am-home-more">
            <Link href="/guides">
              {t("guides.all")}
              <Icon name="arrow-right" size={18} />
            </Link>
          </p>
        </Section>
      ) : null}

    </>
  );
}
