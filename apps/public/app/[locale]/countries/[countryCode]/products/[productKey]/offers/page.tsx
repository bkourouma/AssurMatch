import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPathname } from "../../../../../../../i18n/navigation";
import { toLocale } from "../../../../../../../i18n/routing";
import { OfferComparisonBar } from "../../../../../../components/forms/offer-comparison-bar";
import { OfferCard } from "../../../../../../components/offer-cards";
import { IndicativeOfferNotice, TechnicalRoleNotice } from "../../../../../../components/public-journey";
import { Breadcrumb } from "../../../../../../components/ui/breadcrumb";
import { Button } from "../../../../../../components/ui/button";
import { EmptyState } from "../../../../../../components/ui/empty-state";
import { Field, fieldControlProps } from "../../../../../../components/ui/field";
import { Hero } from "../../../../../../components/ui/hero";
import { Notice } from "../../../../../../components/ui/notice";
import { Section } from "../../../../../../components/ui/section";
import { listCountryDirectory, listPublicOffers, listPublicProducts } from "../../../../../../lib/public-api";
import { buildMetadata, localeUrl } from "../../../../../../lib/seo";
import type { PageMetadata } from "../../../../../../lib/seo";

/**
 * Indicative offers of a product, with the criteria filters, the explained score and the side-by-side
 * selection. The filter form and the comparison form are plain GET forms: the page works without
 * JavaScript, and the sticky comparison bar is the only enhancement layered on top.
 */

type SearchParams = Record<string, string | string[] | undefined>;
type PageParams = { locale: string; countryCode: string; productKey: string };

const COMPARE_FORM_ID = "compare-form";

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

const priorityOptions = ["", "price", "guarantees", "speed", "deductible", "flexibility"] as const;

const paymentOptions = ["monthly", "quarterly", "semiannual", "annual"] as const;

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<PageMetadata> {
  const { locale: rawLocale, countryCode, productKey } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "Offers" });
  return buildMetadata({
    title: t("title"),
    description: t("description", { countryCode, productKey }),
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

  const directory = await listCountryDirectory();
  const iso = countryCode.trim().toUpperCase();
  const entry = directory.data.find((item) => item.isoCode.toUpperCase() === iso);
  const countryName = entry?.name ?? iso;
  const currency = entry?.currency;

  const products = await listPublicProducts(countryCode);
  const productName = products.data.find((item) => item.key === productKey)?.name ?? productKey;

  return (
    <>
      <div className="am-container">
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
      </div>

      <Hero title={t("title")} lead={t("lead")}>
        <TechnicalRoleNotice />
        <IndicativeOfferNotice />
      </Hero>

      <Section>
        <form className="pub-card pub-form" method="get" aria-label={t("filtersLabel")}>
          <fieldset>
            <legend>{t("filtersLegend")}</legend>
            <div className="pub-form__grid">
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
              <Field id="am-filter-guarantee" label={t("guarantee")}>
                <input
                  {...fieldControlProps("am-filter-guarantee", {})}
                  name="guarantee"
                  defaultValue={first(filters.guarantee)}
                />
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

          <fieldset>
            <legend>{t("sortLegend")}</legend>
            <div className="pub-form__grid pub-form__grid--two">
              <Field id="am-filter-sort" label={t("sortLabel")}>
                <select
                  {...fieldControlProps("am-filter-sort", {})}
                  name="sort"
                  defaultValue={first(filters.sort) || "updated_desc"}
                >
                  {sortOptions.map((value) => (
                    <option key={value} value={value}>
                      {t(`sort.${value}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="am-filter-priority" label={t("priorityLabel")} hint={t("filtersHint")}>
                <select
                  {...fieldControlProps("am-filter-priority", { hint: t("filtersHint") })}
                  name="priority"
                  defaultValue={priority}
                >
                  {priorityOptions.map((value) => (
                    <option key={value || "none"} value={value}>
                      {value === "" ? t("priority.none") : t(`priority.${value}`)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </fieldset>

          <div className="am-cluster">
            <Button type="submit">{t("apply")}</Button>
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

      <Section title={t("listLabel")}>
        {/* The offer checkboxes live inside the cards and post to this form through `form=`. */}
        <form id={COMPARE_FORM_ID} method="get" action={compareAction} aria-label={t("compareFormLabel")}>
          {priority ? <input type="hidden" name="priority" value={priority} /> : null}
          <p className="am-field__hint">{t("compareHint")}</p>
        </form>

        {offers.status === "error" ? (
          <EmptyState title={t("error.title")} description={offers.publicMessage ?? t("error.description")} />
        ) : null}
        {offers.status !== "error" && offers.data.length === 0 ? (
          <EmptyState title={t("empty.title")} description={t("empty.description")} />
        ) : null}

        {offers.data.length > 0 ? (
          <>
            <p className="am-field__hint">{t("resultsCount", { count: offers.data.length })}</p>
            <div className="am-stack">
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
          </>
        ) : null}

        <Notice tone="indicative">{t("fineprint")}</Notice>
      </Section>

      <OfferComparisonBar formId={COMPARE_FORM_ID} />
    </>
  );
}
