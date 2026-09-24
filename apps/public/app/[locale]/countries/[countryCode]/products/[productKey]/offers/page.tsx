import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname } from "../../../../../../../i18n/navigation";
import { toLocale } from "../../../../../../../i18n/routing";
import { OfferComparisonBar } from "../../../../../../components/forms/offer-comparison-bar";
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

const sortOptions = [
  "updated_desc",
  "price_asc",
  "price_desc",
  "coverage_desc",
  "speed_asc",
  "score_desc",
  "popularity_desc",
  "name_asc",
  "sponsored_explicit"
] as const;
type SortOption = (typeof sortOptions)[number];

const priorityOptions = ["", "price", "guarantees", "speed", "deductible", "flexibility"] as const;

const paymentOptions = ["monthly", "quarterly", "semiannual", "annual"] as const;

/**
 * Filter keys of the collapsible panel, counted in the "n active filters" badge. `sort` always has
 * a value and `priority` now lives in the results header, so neither belongs in this count.
 */
const panelFilterKeys = [
  "minPrice",
  "maxPrice",
  "minGuaranteeLevel",
  "maxDeductible",
  "maxProcessingDays",
  "insurer",
  "guarantee",
  "paymentFlexibility",
  "broker"
] as const;

function sortOptionOf(value: string): SortOption {
  return (sortOptions as readonly string[]).includes(value) ? (value as SortOption) : "updated_desc";
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
  const offers = await listPublicOffers(countryCode, productKey, filters);
  const priority = first(filters.priority);
  const compareAction = getPathname({ locale, href: "/compare" });

  // Derived server-side from the query string, so the panel opens on a filtered list even with no JS.
  const activeFilters = panelFilterKeys.filter((key) => first(filters[key]).trim() !== "").length;
  const sort = sortOptionOf(first(filters.sort));

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
        <details className="am-j-filters" open={activeFilters > 0}>
          <summary>
            <Icon name="sliders" size={22} />
            <span>{t("filtersLegend")}</span>
            {activeFilters > 0 ? <Badge tone="new">{t("filtersActive", { count: activeFilters })}</Badge> : null}
            <span className="am-j-filters__chevron">
              <Icon name="chevron-down" size={22} />
            </span>
          </summary>

          <form className="am-j-filters__form" method="get" aria-label={t("filtersLabel")}>
            {/* The sort row is a separate form: applying a filter must not reset the chosen order. */}
            <input type="hidden" name="sort" value={sort} />
            {priority ? <input type="hidden" name="priority" value={priority} /> : null}

            <fieldset>
              <legend className="am-j-filters__legend">{t("filtersLegend")}</legend>
              <div className="am-j-fieldgrid">
                <Field id="am-filter-min-price" label={t("minPrice")}>
                  <input
                    {...fieldControlProps("am-filter-min-price", {})}
                    name="minPrice"
                    type="number"
                    min="0"
                    defaultValue={first(filters.minPrice)}
                  />
                </Field>
                <Field id="am-filter-max-price" label={t("maxPrice")}>
                  <input
                    {...fieldControlProps("am-filter-max-price", {})}
                    name="maxPrice"
                    type="number"
                    min="0"
                    defaultValue={first(filters.maxPrice)}
                  />
                </Field>
                <Field id="am-filter-guarantee-level" label={t("minGuaranteeLevel")}>
                  <select
                    {...fieldControlProps("am-filter-guarantee-level", {})}
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
                <Field id="am-filter-deductible" label={t("maxDeductible")}>
                  <input
                    {...fieldControlProps("am-filter-deductible", {})}
                    name="maxDeductible"
                    type="number"
                    min="0"
                    defaultValue={first(filters.maxDeductible)}
                  />
                </Field>
                <Field id="am-filter-processing" label={t("maxProcessingDays")}>
                  <input
                    {...fieldControlProps("am-filter-processing", {})}
                    name="maxProcessingDays"
                    type="number"
                    min="0"
                    defaultValue={first(filters.maxProcessingDays)}
                  />
                </Field>
                <Field id="am-filter-insurer" label={t("insurer")}>
                  <input {...fieldControlProps("am-filter-insurer", {})} name="insurer" defaultValue={first(filters.insurer)} />
                </Field>
                <Field id="am-filter-guarantee" label={t("guarantee")} hint={guarantees.length === 0 ? t("guaranteeEmpty") : undefined}>
                  <select
                    {...fieldControlProps("am-filter-guarantee", { hint: guarantees.length === 0 ? t("guaranteeEmpty") : undefined })}
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
                <Field id="am-filter-payment" label={t("paymentFlexibility")}>
                  <select
                    {...fieldControlProps("am-filter-payment", {})}
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
                <Field id="am-filter-broker" label={t("broker")}>
                  <input {...fieldControlProps("am-filter-broker", {})} name="broker" defaultValue={first(filters.broker)} />
                </Field>
              </div>
            </fieldset>

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
        </details>
      </Section>

      <Section title={t("listLabel")} className="am-j-pad-bottom">
        {/* The offer checkboxes live inside the cards and post to this form through `form=`. */}
        <form id={COMPARE_FORM_ID} method="get" action={compareAction} aria-label={t("compareFormLabel")}>
          {priority ? <input type="hidden" name="priority" value={priority} /> : null}
        </form>

        {offers.data.length > 0 ? (
          <div className="am-j-results">
            <p className="am-j-results__count">{t("resultsCount", { count: offers.data.length })}</p>

            {/* Order and priority belong next to the count: they describe the list you are reading,
                not the criteria you are narrowing it down with. */}
            <form className="am-j-sortform" id={SORT_FORM_ID} method="get" aria-label={t("sortLegend")}>
              {panelValues.map((entry) => (
                <input type="hidden" key={entry.key} name={entry.key} value={entry.value} />
              ))}
              <Field id="am-sort" label={t("sortLabel")}>
                <select {...fieldControlProps("am-sort", {})} name="sort" defaultValue={sort}>
                  {sortOptions.map((value) => (
                    <option key={value} value={value}>
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
