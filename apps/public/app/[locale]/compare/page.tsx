import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "../../../i18n/navigation";
import { toLocale } from "../../../i18n/routing";
import { OfferScore, ScoreBreakdown, SponsoredBadge } from "../../components/offer-cards";
import { JourneyRoute } from "../../components/journey/journey-route";
import { JourneyHeroNotice } from "../../components/public-journey";
import { EntrySelector, type EntrySelectorProduct } from "../../components/site/entry-selector";
import { BackendText } from "../../components/ui/backend-text";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { Hero } from "../../components/ui/hero";
import { Icon } from "../../components/ui/icons";
import { Notice } from "../../components/ui/notice";
import { Route } from "../../components/ui/route-line";
import { Section } from "../../components/ui/section";
import { formatDate, formatMoney } from "../../lib/country-format";
import { comparePublicOffers, listPublicProducts } from "../../lib/public-api";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";
import { readVisitorCountry } from "../../lib/visitor-country";
import "../../styles/pages/journey.css";

/**
 * Side-by-side comparison of 2 to 4 indicative offers, aligned criterion by criterion.
 *
 * `/comparer` with no `ids` is where the header's main call to action lands, so it is an entry
 * point, not an error: it offers the country/product selector and says how a comparison is built.
 * "Selection incomplete" is kept for what it actually describes - a selection that came in wrong.
 */

type SearchParams = Record<string, string | string[] | undefined>;

/** The three moves that produce a comparison, in the order the visitor makes them. */
const HOW_STEPS = ["country", "offers", "compare"] as const;

/**
 * The step titles of the catalogue carry their own number ("1. Choisissez..."); the route stops
 * already print it in their dot, so the number is not read twice.
 */
function withoutLeadingNumber(title: string): string {
  return title.replace(/^\s*\d+\s*[.)]\s*/, "");
}

/** Country and product of the list the selection came from, when the offers page passed them. */
const ISO_CODE = /^[A-Za-z]{2}$/;
const PRODUCT_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function firstOf(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function idsFrom(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(raw.flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean))];
}

type CompareRowValue = string | number | boolean | null;
type CompareRow = { key: string; label: string; values: Record<string, CompareRowValue> };

/**
 * Row keys with a short explanation in the `Compare.rowExplanations` catalogue (`content/02`): every
 * `guarantee:{key}` row shares the same generic explanation, the rest map one to one. A row the
 * backend adds later without an entry here simply renders without an explanation underneath. The
 * literal union (rather than plain `string`) is what lets `t(`rowExplanations.${key}`)` type-check
 * against the generated catalogue keys.
 */
const ROW_EXPLANATION_KEYS = [
  "partner",
  "insurer",
  "price",
  "deductible",
  "ceiling",
  "processingDelay",
  "paymentFlexibility",
  "score",
  "validUntil",
  "guarantee"
] as const;
type RowExplanationKey = (typeof ROW_EXPLANATION_KEYS)[number];

const MONEY_ROWS = new Set(["price", "priceMax", "deductible", "ceiling"]);

function rowExplanationKey(key: string): RowExplanationKey | null {
  if (key.startsWith("guarantee:")) return "guarantee";
  return (ROW_EXPLANATION_KEYS as readonly string[]).includes(key) ? (key as RowExplanationKey) : null;
}

/** The four numeric rows that get a "most favourable value" highlight (`content/02`), and its direction. */
const HIGHLIGHT_DIRECTION = {
  price: "min",
  deductible: "min",
  ceiling: "max",
  processingDelay: "min"
} as const;
type HighlightKey = keyof typeof HIGHLIGHT_DIRECTION;

function highlightKeyOf(key: string): HighlightKey | null {
  return (Object.keys(HIGHLIGHT_DIRECTION) as string[]).includes(key) ? (key as HighlightKey) : null;
}

/** Offer ids carrying the most favourable numeric value of a row, never a subjective "best" (Constitution VIII). */
function highlightedOfferIds(row: CompareRow, direction: "min" | "max"): Set<string> {
  const numeric = Object.entries(row.values).filter((entry): entry is [string, number] => typeof entry[1] === "number");
  if (numeric.length === 0) return new Set();
  const target = direction === "min" ? Math.min(...numeric.map(([, value]) => value)) : Math.max(...numeric.map(([, value]) => value));
  return new Set(numeric.filter(([, value]) => value === target).map(([id]) => id));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Compare" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/compare", locale });
}

export default async function PublicComparePage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Compare");
  const common = await getTranslations("Common");
  const cards = await getTranslations("OfferCards");
  const query = searchParams ? await searchParams : {};
  const ids = idsFrom(query.ids);
  const priority = Array.isArray(query.priority) ? query.priority[0] : query.priority;
  const countryParam = firstOf(query.country);
  const productParam = firstOf(query.product);
  const countryCode = countryParam && ISO_CODE.test(countryParam) ? countryParam : undefined;
  const productKey = countryCode && productParam && PRODUCT_KEY.test(productParam) ? productParam : undefined;
  const selectionValid = ids.length >= 2 && ids.length <= 4;
  // No ids at all is the landing state of the main call to action; ids that do not make a valid
  // selection are a real error and keep their own message.
  const entryState = ids.length === 0;
  const comparison = selectionValid ? await comparePublicOffers(ids, priority) : null;

  // Same entry point as the home page: the visitor country is a default, never a redirection.
  const visitor = entryState ? await readVisitorCountry() : null;
  const selectable = visitor ? visitor.directory.filter((country) => country.availability !== "waitlist") : [];
  const preselected = selectable.find((country) => country.isoCode === visitor?.isoCode) ?? selectable[0];
  const entryProducts: EntrySelectorProduct[] =
    entryState && preselected
      ? (await listPublicProducts(preselected.isoCode)).data.map((product) => ({
          key: product.key,
          name: product.name,
          countryIso: preselected.isoCode
        }))
      : [];

  /** Amounts, dates and delays arrive raw from the comparison rows; they are formatted like the offer cards. */
  function cell(value: string | number | boolean | null, rowKey: string): string {
    if (value === null) return common("notProvided");
    if (typeof value === "boolean") return value ? common("yes") : common("no");
    if (typeof value === "number" && MONEY_ROWS.has(rowKey)) return formatMoney(value, { locale }) ?? String(value);
    if (typeof value === "number" && rowKey === "processingDelay") return cards("processingDays", { days: value });
    if (typeof value === "string" && rowKey === "validUntil") return formatDate(value, { locale });
    return String(value);
  }

  const items = comparison?.status === "success" ? comparison.data?.items ?? [] : [];
  const compared = comparison?.status === "success" && comparison.data ? comparison.data : null;

  const breadcrumb = (
    <Breadcrumb
      label={common("breadcrumbLabel")}
      items={[
        { name: common("home"), url: localeUrl(locale, "/") },
        { name: t("breadcrumb"), url: localeUrl(locale, "/compare") }
      ]}
    />
  );

  return (
    <>
      <Hero
        title={entryState ? t("start.title") : t("title")}
        lead={entryState ? t("start.lead") : t("lead")}
        size="sm"
        /* The landing (no selection yet) keeps its trail: no stop of the journey has been passed. */
        {...(entryState ? {} : { route: <JourneyRoute current="offers" countryCode={countryCode} productKey={productKey} /> })}
        breadcrumb={breadcrumb}
        {...(entryState && selectable.length > 0
          ? {
              aside: (
                <div className="am-j-entry">
                  <EntrySelector
                    title={t("start.selectorTitle")}
                    countries={selectable.map((country) => ({ isoCode: country.isoCode, name: country.name }))}
                    products={entryProducts}
                    defaultCountry={preselected?.isoCode ?? null}
                  />
                </div>
              )
            }
          : {})}
      >
        <JourneyHeroNotice />
      </Hero>

      {entryState ? (
        <Section title={t("how.title")} lead={t("how.lead")} tone="muted">
          <Route
            stops={HOW_STEPS.map((step) => ({
              key: step,
              title: withoutLeadingNumber(t(`how.${step}.title`)),
              body: t(`how.${step}.description`)
            }))}
          />
          {selectable.length === 0 ? (
            <div className="am-cluster am-j-tail">
              <Button href="/countries" icon={<Icon name="globe" size={18} />}>
                {t("seeCountries")}
              </Button>
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* One empty state, one way forward: the page never repeats the same button twice. */}
      {!entryState && !selectionValid ? (
        <Section>
          <EmptyState
            icon="scale"
            tone="muted"
            align="center"
            title={t("selectionError.title")}
            description={t("selectionError.description")}
            action={
              <Button href="/countries" icon={<Icon name="globe" size={18} />}>
                {t("seeCountries")}
              </Button>
            }
          />
        </Section>
      ) : null}

      {comparison && !compared ? (
        <Section>
          <EmptyState
            icon="wifi-off"
            tone="muted"
            align="center"
            title={t("unavailable.title")}
            description={comparison.publicMessage ?? t("unavailable.description")}
            action={
              <Button href="/countries" variant="secondary">
                {t("seeCountries")}
              </Button>
            }
          />
        </Section>
      ) : null}

      {compared ? (
        <>
          <Section title={t("tableLabel")} spacing="compact">
            <div className="am-stack am-stack--lg">
              <Notice tone="indicative">
                <BackendText>{compared.disclaimer}</BackendText>
              </Notice>

              {/* Two structures, one visible at a time (CSS media query, FR-013): the desktop table
                  keeps its horizontal scroll for a wide row count, the mobile block below 768px never
                  scrolls sideways - one card per criterion, every offer's value stacked inside it. */}
              <div className="am-j-compare-desktop">
                <p className="am-j-scroll-hint">{t("scrollHint")}</p>
                <div className="am-table-wrap">
                  <table className="am-table am-j-compare" aria-label={t("tableLabel")}>
                    <thead>
                      <tr>
                        <th scope="col">{t("criterion")}</th>
                        {items.map((offer) => (
                          <th scope="col" key={offer.id}>
                            <span className="am-j-compare__head">
                              <span className="am-j-compare__name">
                                <BackendText>{offer.name}</BackendText>
                              </span>
                              {offer.score ? <OfferScore score={offer.score} /> : null}
                              <SponsoredBadge offer={offer} />
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {compared.rows.map((row) => {
                        const explanationKey = rowExplanationKey(row.key);
                        const highlightKey = highlightKeyOf(row.key);
                        const bestIds = highlightKey ? highlightedOfferIds(row, HIGHLIGHT_DIRECTION[highlightKey]) : new Set<string>();
                        return (
                          <tr key={row.key}>
                            <th scope="row">
                              <BackendText>{row.label}</BackendText>
                              {explanationKey ? <p className="am-j-compare__rowhint">{t(`rowExplanations.${explanationKey}`)}</p> : null}
                            </th>
                            {items.map((offer) => (
                              <td key={offer.id} data-highlight={bestIds.has(offer.id) ? "true" : undefined}>
                                <BackendText>{cell(row.values[offer.id] ?? null, row.key)}</BackendText>
                                {highlightKey && bestIds.has(offer.id) ? (
                                  <span className="am-visually-hidden">{` (${t(`highlight.${highlightKey}`)})`}</span>
                                ) : null}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="am-j-compare-mobile">
                {compared.rows.map((row) => {
                  const explanationKey = rowExplanationKey(row.key);
                  const highlightKey = highlightKeyOf(row.key);
                  const bestIds = highlightKey ? highlightedOfferIds(row, HIGHLIGHT_DIRECTION[highlightKey]) : new Set<string>();
                  return (
                    <div className="am-j-comparecard" key={row.key}>
                      <h3 className="am-j-comparecard__title">
                        <BackendText>{row.label}</BackendText>
                      </h3>
                      {explanationKey ? <p className="am-j-comparecard__hint">{t(`rowExplanations.${explanationKey}`)}</p> : null}
                      <ul className="am-j-comparecard__rows">
                        {items.map((offer) => (
                          <li className="am-j-comparecard__row" key={offer.id} data-highlight={bestIds.has(offer.id) ? "true" : undefined}>
                            <span className="am-j-comparecard__name">
                              <BackendText>{offer.name}</BackendText>
                              <SponsoredBadge offer={offer} />
                            </span>
                            <span className="am-j-comparecard__value">
                              <BackendText>{cell(row.values[offer.id] ?? null, row.key)}</BackendText>
                              {highlightKey && bestIds.has(offer.id) ? (
                                <span className="am-visually-hidden">{` (${t(`highlight.${highlightKey}`)})`}</span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </Section>

          <Section title={t("scoresTitle")} tone="muted">
            <ul className="am-j-scorecards">
              {items.map((offer) => (
                <li className="am-j-scorecard" key={offer.id}>
                  <div className="am-j-scorecard__head">
                    <h3 className="am-j-scorecard__title">
                      <BackendText>{offer.name}</BackendText>
                    </h3>
                    {offer.score ? <OfferScore score={offer.score} size="lg" /> : null}
                  </div>
                  <SponsoredBadge offer={offer} />
                  {offer.score ? <ScoreBreakdown score={offer.score} /> : null}
                  <div className="am-cluster">
                    <Button
                      variant="secondary"
                      href={{
                        pathname: "/offers/[offerId]",
                        params: { offerId: offer.id },
                        ...(countryCode && productKey ? { query: { country: countryCode, product: productKey } } : {})
                      }}
                      iconAfter={<Icon name="arrow-right" size={18} />}
                    >
                      {common("seeDetail")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section ariaLabel={t("journeyLabel")} spacing="compact">
            <p className="am-j-morelink">
              <Link href="/countries">
                {t("seeCountries")}
                <Icon name="arrow-right" size={18} />
              </Link>
            </p>
          </Section>
        </>
      ) : null}
    </>
  );
}
