import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname } from "../../../../../../../i18n/navigation";
import { toLocale } from "../../../../../../../i18n/routing";
import { OFFER_CAP_HINT_ID, OfferComparisonBar, SelectionAssist } from "../../../../../../components/forms/offer-comparison-bar";
import { AutoSubmit } from "../../../../../../components/journey/auto-submit";
import { OfferCard } from "../../../../../../components/offer-cards";
import { JourneyHeroNotice } from "../../../../../../components/public-journey";
import { Badge } from "../../../../../../components/ui/badge";
import { Breadcrumb } from "../../../../../../components/ui/breadcrumb";
import { Button } from "../../../../../../components/ui/button";
import { EmptyState } from "../../../../../../components/ui/empty-state";
import { Field, fieldControlProps } from "../../../../../../components/ui/field";
import { Hero } from "../../../../../../components/ui/hero";
import { Icon } from "../../../../../../components/ui/icons";
import { Notice } from "../../../../../../components/ui/notice";
import { Section } from "../../../../../../components/ui/section";
import { listCountryDirectory, listPublicOffers, listPublicProducts } from "../../../../../../lib/public-api";
import { buildMetadata, localeUrl } from "../../../../../../lib/seo";
import type { PageMetadata } from "../../../../../../lib/seo";

/**
 * Indicative offers of a product, with the criteria filters, the explained score and the side-by-side
 * selection. The filter form, the sort form and the comparison form are plain GET forms: the page
 * works without JavaScript, and the sticky comparison bar and the auto-submitting sort row are the
 * only enhancements layered on top.
 */

type SearchParams = Record<string, string | string[] | undefined>;
type PageParams = { locale: string; countryCode: string; productKey: string };

const COMPARE_FORM_ID = "compare-form";
const SORT_FORM_ID = "offers-sort-form";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

/**
 * Visitor-facing sort list (D5, `content/02`): score first, then price, guarantees, speed,
 * popularity and last update, in that exact order. "Sponsored first" and "name" stay valid on the
 * shared API enum for other callers but never reach this select; an unknown or removed value in the
 * URL simply falls back to the default rather than being preserved.
 */
const sortOptions = ["score_desc", "price_asc", "coverage_desc", "speed_asc", "popularity_desc", "updated_desc"] as const;
type SortOption = (typeof sortOptions)[number];

const priorityOptions = ["", "price", "guarantees", "speed", "deductible", "flexibility"] as const;

const paymentOptions = ["monthly", "quarterly", "semiannual", "annual"] as const;

/** The 4 always-visible filters (D-Filtres, `content/02`). */
const primaryFilterKeys = ["minGuaranteeLevel", "guarantee", "paymentFlexibility", "minPrice", "maxPrice"] as const;
/** The filters folded under "Plus de filtres". */
const secondaryFilterKeys = ["maxDeductible", "maxProcessingDays", "insurer", "broker"] as const;

/**
 * Filter keys counted in the "n active filters" badge shown on the "Plus de filtres" disclosure: the
 * 4 primary filters plus the secondary ones, never the sort (`content/02`, "Bloc filtres").
 */
const panelFilterKeys = [...primaryFilterKeys, ...secondaryFilterKeys] as const;

/** FR-017: the visitor default is `score_desc`, set here by the page, not by the shared schema
 * (`offerListQuerySchema.sort.default("updated_desc")`), whose default stays for other callers. */
function sortOptionOf(value: string): SortOption {
  return (sortOptions as readonly string[]).includes(value) ? (value as SortOption) : "score_desc";
}

/** Country and product names, so the metadata reads "Auto en Cote d'Ivoire", not "auto en CI". */
async function resolveNames(countryCode: string, productKey: string): Promise<{ countryName: string; productName: string; currency?: string }> {
  const directory = await listCountryDirectory();
  const iso = countryCode.trim().toUpperCase();
  const entry = directory.data.find((item) => item.isoCode.toUpperCase() === iso);
  const products = await listPublicProducts(countryCode);
  return {
    countryName: entry?.name ?? iso,
    productName: products.data.find((item) => item.key === productKey)?.name ?? productKey,
    ...(entry?.currency ? { currency: entry.currency } : {})
  };
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<PageMetadata> {
  const { locale: rawLocale, countryCode, productKey } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "Offers" });
  const { countryName, productName } = await resolveNames(countryCode, productKey);
  return buildMetadata({
    title: t("title"),
    description: t("description", { countryName, productName }),
    href: "/countries/[countryCode]/products/[productKey]/offers",
    params: { countryCode, productKey },
    locale
  });
}

export default async function PublicOffersPage({
  params,
  searchParams
}: {
  params: Promise<PageParams>;
  searchParams?: Promise<SearchParams>;
}) {
  const { locale: rawLocale, countryCode, productKey } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations("Offers");
  const common = await getTranslations("Common");
  const countries = await getTranslations("Countries");
  const payment = await getTranslations("OfferCards.payment");

  const filters = searchParams ? await searchParams : {};
  // The validated visitor sort (never the raw `?sort=`) is sent to the API on every request: the
  // shared API default is `updated_desc`, so leaving it out would show "Score" in the select while
  // the list is ordered by update date. An unknown value falls back to `score_desc` (FR-017, D5).
  const sort = sortOptionOf(first(filters.sort));
  const offers = await listPublicOffers(countryCode, productKey, { ...filters, sort });
  const priority = first(filters.priority);
  const compareAction = getPathname({ locale, href: "/compare" });

  // Derived server-side from the query string, so the disclosure opens on a filtered list even
  // with no JS. The badge counts every active filter (primary and secondary); the "open" state of
  // "Plus de filtres" only reacts to its own (secondary) filters, since the primary ones are always
  // visible already.
  const activeFilters = panelFilterKeys.filter((key) => first(filters[key]).trim() !== "").length;
  const secondaryActive = secondaryFilterKeys.filter((key) => first(filters[key]).trim() !== "").length;

  const { countryName, productName, currency } = await resolveNames(countryCode, productKey);

  /**
   * Guarantee keys the loaded offers actually carry, so the filter offers a real choice instead of
   * asking the visitor to type an internal key. A key that is currently filtered on is kept in the
   * list even when the filtered result no longer contains it, otherwise the select would silently
   * drop the value it is meant to show as selected.
   */
  const guaranteeFilter = first(filters.guarantee).trim();
  const guaranteeOptions = new Map<string, string>();
  for (const offer of offers.data) {
    for (const guarantee of offer.guarantees) {
      if (!guaranteeOptions.has(guarantee.key)) guaranteeOptions.set(guarantee.key, guarantee.label || guarantee.key);
    }
  }
  if (guaranteeFilter && !guaranteeOptions.has(guaranteeFilter)) guaranteeOptions.set(guaranteeFilter, guaranteeFilter);
  const guarantees = [...guaranteeOptions.entries()].sort((a, b) => a[1].localeCompare(b[1], locale));

  /** The two GET forms are siblings, so each carries the other's values as hidden inputs. */
  const panelValues = panelFilterKeys
    .map((key) => ({ key, value: first(filters[key]) }))
    .filter((entry) => entry.value.trim() !== "");

  return (
    <>
      <Hero
        kicker={t("kicker", { product: productName, country: countryName })}
        title={t("title")}
        lead={t("lead")}
        size="sm"
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: countries("breadcrumb"), url: localeUrl(locale, "/countries") },
              { name: countryName, url: localeUrl(locale, "/countries/[countryCode]", { countryCode }) },
              {
                name: productName,
                url: localeUrl(locale, "/countries/[countryCode]/products/[productKey]", { countryCode, productKey })
              },
              {
                name: t("breadcrumb"),
                url: localeUrl(locale, "/countries/[countryCode]/products/[productKey]/offers", { countryCode, productKey })
              }
            ]}
          />
        }
      >
        <JourneyHeroNotice />
      </Hero>

      <Section spacing="compact">
        {/*
         * D-Filtres (`content/02`): the 4 primary filters stay always visible, never folded away;
         * only the secondary ones live under the "Plus de filtres" disclosure. Both fieldsets belong
         * to the same GET form so applying either group keeps the other's values (hidden inputs) and
         * the whole panel still works with JavaScript switched off.
         */}
        <form className="am-j-filterspanel am-j-filters__form" method="get" aria-label={t("filtersLabel")}>
          {/* The sort row is a separate form: applying a filter must not reset the chosen order. */}
          <input type="hidden" name="sort" value={sort} />
          {priority ? <input type="hidden" name="priority" value={priority} /> : null}

          <fieldset>
            <legend className="am-j-filters__legend">{t("filtersLegend")}</legend>
            <p className="am-j-filters__hint">{t("filtersHint")}</p>
            <div className="am-j-fieldgrid">
              <Field id="am-filter-guarantee-level" label={t("minGuaranteeLevel")} hint={t("minGuaranteeLevelHint")}>
                <select
                  {...fieldControlProps("am-filter-guarantee-level", { hint: t("minGuaranteeLevelHint") })}
                  name="minGuaranteeLevel"
                  defaultValue={first(filters.minGuaranteeLevel)}
                >
                  <option value="">{t("allMasculine")}</option>
                  {[1, 2, 3, 4, 5].map((level) => (
                    <option key={level} value={level}>
                      {t("guaranteeLevelOption", { level })}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                id="am-filter-guarantee"
                label={t("guarantee")}
                hint={guarantees.length === 0 ? t("guaranteeEmpty") : t("guaranteeHint")}
              >
                <select
                  {...fieldControlProps("am-filter-guarantee", { hint: guarantees.length === 0 ? t("guaranteeEmpty") : t("guaranteeHint") })}
                  name="guarantee"
                  defaultValue={guaranteeFilter}
                  disabled={guarantees.length === 0}
                >
                  <option value="">{t("allFeminine")}</option>
                  {guarantees.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="am-filter-payment" label={t("paymentFlexibility")} hint={t("paymentFlexibilityHint")}>
                <select
                  {...fieldControlProps("am-filter-payment", { hint: t("paymentFlexibilityHint") })}
                  name="paymentFlexibility"
                  defaultValue={first(filters.paymentFlexibility)}
                >
                  <option value="">{t("allFeminine")}</option>
                  {paymentOptions.map((value) => (
                    <option key={value} value={value}>
                      {payment(value)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="am-filter-min-price" label={t("minPrice")} hint={t("priceHint")}>
                <input
                  {...fieldControlProps("am-filter-min-price", { hint: t("priceHint") })}
                  name="minPrice"
                  type="number"
                  min="0"
                  defaultValue={first(filters.minPrice)}
                />
              </Field>
              <Field id="am-filter-max-price" label={t("maxPrice")} hint={t("priceHint")}>
                <input
                  {...fieldControlProps("am-filter-max-price", { hint: t("priceHint") })}
                  name="maxPrice"
                  type="number"
                  min="0"
                  defaultValue={first(filters.maxPrice)}
                />
              </Field>
            </div>
          </fieldset>

          <details className="am-j-more" open={secondaryActive > 0}>
            <summary>
              <span className="am-j-filters-more__closed">{t("moreFilters")}</span>
              <span className="am-j-filters-more__open">{t("lessFilters")}</span>
              {activeFilters > 0 ? <Badge tone="new">{t("filtersActive", { count: activeFilters })}</Badge> : null}
            </summary>
            <div className="am-j-more__body">
              <fieldset>
                <legend className="am-j-filters__legend">{t("moreFiltersLegend")}</legend>
                <div className="am-j-fieldgrid">
                  <Field id="am-filter-deductible" label={t("maxDeductible")} hint={t("maxDeductibleHint")}>
                    <input
                      {...fieldControlProps("am-filter-deductible", { hint: t("maxDeductibleHint") })}
                      name="maxDeductible"
                      type="number"
                      min="0"
                      defaultValue={first(filters.maxDeductible)}
                    />
                  </Field>
                  <Field id="am-filter-processing" label={t("maxProcessingDays")} hint={t("maxProcessingDaysHint")}>
                    <input
                      {...fieldControlProps("am-filter-processing", { hint: t("maxProcessingDaysHint") })}
                      name="maxProcessingDays"
                      type="number"
                      min="0"
                      defaultValue={first(filters.maxProcessingDays)}
                    />
                  </Field>
                  <Field id="am-filter-insurer" label={t("insurer")} hint={t("insurerHint")}>
                    <input
                      {...fieldControlProps("am-filter-insurer", { hint: t("insurerHint") })}
                      name="insurer"
                      defaultValue={first(filters.insurer)}
                    />
                  </Field>
                  <Field id="am-filter-broker" label={t("broker")} hint={t("brokerHint")}>
                    <input
                      {...fieldControlProps("am-filter-broker", { hint: t("brokerHint") })}
                      name="broker"
                      defaultValue={first(filters.broker)}
                    />
                  </Field>
                </div>
              </fieldset>
            </div>
          </details>

          <div className="am-j-filters__actions">
            <Button type="submit" icon={<Icon name="filter" size={18} />}>
              {t("apply")}
            </Button>
            <Button
              variant="tertiary"
              href={{
                pathname: "/countries/[countryCode]/products/[productKey]/offers",
                params: { countryCode, productKey }
              }}
            >
              {t("reset")}
            </Button>
          </div>
        </form>
      </Section>

      <Section title={t("listLabel")} className="am-j-pad-bottom">
        {/* The offer checkboxes live inside the cards and post to this form through `form=`. */}
        <form id={COMPARE_FORM_ID} method="get" action={compareAction} aria-label={t("compareFormLabel")}>
          {priority ? <input type="hidden" name="priority" value={priority} /> : null}
        </form>

        {offers.data.length > 0 ? (
          <div className="am-j-results">
            <div className="am-j-results__lead">
              <p className="am-j-results__count">{t("resultsCount", { count: offers.data.length })}</p>
              {/* Progressive enhancement: counts the ticked cards and only shows itself at exactly
                  one selection, in an `aria-live` region next to the count (D-Comparaison, `content/02`). */}
              <SelectionAssist />
            </div>

            {/* Order and priority belong next to the count: they describe the list you are reading,
                not the criteria you are narrowing it down with. */}
            <form className="am-j-sortform" id={SORT_FORM_ID} method="get" aria-label={t("sortLegend")}>
              {panelValues.map((entry) => (
                <input type="hidden" key={entry.key} name={entry.key} value={entry.value} />
              ))}
              <Field id="am-sort" label={t("sortLabel")}>
                <select {...fieldControlProps("am-sort", {})} name="sort" defaultValue={sort}>
                  {sortOptions.map((value) => (
                    <option key={value} value={value} title={t(`sortExplanation.${value}`)}>
                      {t(`sort.${value}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="am-priority" label={t("priorityLabel")}>
                <select {...fieldControlProps("am-priority", {})} name="priority" defaultValue={priority}>
                  {priorityOptions.map((value) => (
                    <option key={value || "none"} value={value}>
                      {value === "" ? t("priority.none") : t(`priority.${value}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Button type="submit" variant="secondary" className="am-j-nojs">
                {t("sortApply")}
              </Button>
            </form>
            <AutoSubmit formId={SORT_FORM_ID} />
          </div>
        ) : null}

        {offers.status === "error" ? (
          <EmptyState
            icon="wifi-off"
            tone="muted"
            align="center"
            title={t("error.title")}
            description={offers.publicMessage ?? t("error.description")}
          />
        ) : null}
        {offers.status !== "error" && offers.data.length === 0 ? (
          <EmptyState
            icon="search"
            tone="muted"
            align="center"
            title={t("empty.title")}
            description={t("empty.description")}
            action={
              <Button
                variant="secondary"
                href={{
                  pathname: "/countries/[countryCode]/products/[productKey]/offers",
                  params: { countryCode, productKey }
                }}
              >
                {t("reset")}
              </Button>
            }
          />
        ) : null}

        {offers.data.length > 0 ? (
          <div className="am-stack am-stack--lg">
            <p className="am-j-fineprint">{t("compareHint")}</p>
            {/* Referenced by `aria-describedby` on a card's checkbox once 4 offers are selected and
                that checkbox is disabled client-side; kept in the accessibility tree at every other
                time, just visually hidden, rather than toggled in and out of the DOM. */}
            <p id={OFFER_CAP_HINT_ID} className="am-visually-hidden">
              {t("maxReachedHint")}
            </p>
            <div className="am-j-offers">
              {offers.data.map((offer) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  countryCode={countryCode}
                  productKey={productKey}
                  {...(currency ? { currency } : {})}
                />
              ))}
            </div>
            {/* Without JavaScript the floating bar never appears, so the selection keeps a plain
                submit button; the enhanced page hides it as soon as a client boundary mounts. */}
            <div className="am-cluster am-j-nojs">
              <Button type="submit" form={COMPARE_FORM_ID} variant="secondary" icon={<Icon name="scale" size={18} />}>
                {t("compareSubmit")}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="am-j-tail">
          <Notice tone="indicative">{t("fineprint")}</Notice>
        </div>
      </Section>

      <div className="am-container am-j-barwrap">
        <OfferComparisonBar formId={COMPARE_FORM_ID} />
      </div>
    </>
  );
}
