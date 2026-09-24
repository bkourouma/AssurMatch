import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../i18n/routing";
import { BillableCriteriaList } from "../../../components/brokers/billable-criteria-list";
import { PlanPricingCard } from "../../../components/brokers/plan-pricing-card";
import { BackendText } from "../../../components/ui/backend-text";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/empty-state";
import { Hero } from "../../../components/ui/hero";
import { Notice } from "../../../components/ui/notice";
import { Section } from "../../../components/ui/section";
import { Reveal } from "../../../components/motion/reveal";
import { billableLeadCriteria, brokerPlan, type BrokerPlanKey } from "../../../content/brokers";
import { formatMoney } from "../../../lib/country-format";
import { listPartnerPlans } from "../../../lib/public-api";
import { buildMetadata, localeUrl } from "../../../lib/seo";
import type { PageMetadata } from "../../../lib/seo";
import { readVisitorCountry } from "../../../lib/visitor-country";

/**
 * SITE-409: business-to-business pricing for partner brokers. The visitor-facing "prix indicatif, à
 * confirmer par le courtier partenaire" mention does not apply here - this is what a broker pays
 * AssurMatch, not an insurance price - so the page states instead that prices are indicative,
 * excluding tax and specific to each country. Every number comes from `GET /partners/plans`; when the
 * API has no row for a plan, that plan shows "sur devis" / "on request" rather than an invented figure.
 */

type SearchParams = Record<string, string | string[] | undefined>;

const PLAN_ORDER: readonly BrokerPlanKey[] = ["starter", "pro", "enterprise"];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "BrokerPricing" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/brokers/pricing", locale });
}

export default async function BrokerPricingPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("BrokerPricing");
  const common = await getTranslations("Common");

  const visitor = await readVisitorCountry();
  const eligibleCountries = visitor.directory.filter((country) => country.availability !== "waitlist");

  const query = searchParams ? await searchParams : {};
  const queryCountryRaw = Array.isArray(query.pays) ? query.pays[0] : query.pays;
  const queryCountry = queryCountryRaw?.trim().toUpperCase();
  const queryIsEligible = queryCountry ? eligibleCountries.some((country) => country.isoCode.toUpperCase() === queryCountry) : false;
  const selected = queryIsEligible && queryCountry ? queryCountry : (visitor.isoCode ?? eligibleCountries[0]?.isoCode ?? "");

  const plansState = selected ? await listPartnerPlans(selected) : null;
  const items = plansState && plansState.status !== "error" ? plansState.data.items : [];
  const notice = plansState && plansState.status !== "error" ? plansState.data.notice : "";
  const priceByPlan = new Map(items.map((item) => [item.plan, item]));
  const noPrices = items.length === 0;

  const contactAction = (
    <Button href="/contact" variant="secondary">
      {t("empty.action")}
    </Button>
  );

  return (
    <>
      <Hero
        title={t("title")}
        lead={t("lead")}
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: t("breadcrumb"), url: localeUrl(locale, "/brokers/pricing") }
            ]}
          />
        }
      />

      {eligibleCountries.length > 0 ? (
        <Section spacing="compact">
          {/* A plain GET form posting back to this same page with ?pays=XX: no client JavaScript needed. */}
          <form className="am-pricepill" method="get">
            <label className="am-pricepill__label" htmlFor="am-pricing-country">
              {t("countrySelector.label")}
            </label>
            <select id="am-pricing-country" className="am-field__control" name="pays" defaultValue={selected}>
              {eligibleCountries.map((country) => (
                <option key={country.isoCode} value={country.isoCode}>
                  {country.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary" size="sm">
              {t("countrySelector.submit")}
            </Button>
          </form>
        </Section>
      ) : null}

      {/* The title is what stops the page skipping from the hero's h1 straight to the plan cards' h3. */}
      <Section title={t("plansTitle")}>
        {eligibleCountries.length === 0 || noPrices ? (
          <EmptyState title={t("empty.title")} description={t("empty.description")} action={contactAction} />
        ) : (
          <Reveal as="ul" stagger className="am-pricing-grid">
            {PLAN_ORDER.map((key) => {
              const planContent = brokerPlan(locale, key);
              if (!planContent) return null;
              const price = priceByPlan.get(key);
              return (
                <PlanPricingCard
                  key={key}
                  planName={planContent.name}
                  positioning={planContent.positioning}
                  highlighted={key === "pro"}
                  labels={{
                    monthlySubscription: t("pricing.monthlySubscription"),
                    perLead: t("pricing.perLead"),
                    setupFee: t("pricing.setupFee"),
                    onRequest: t("pricing.onRequest")
                  }}
                  {...(price
                    ? {
                        monthlySubscription: formatMoney(price.monthlySubscription, { locale, iso: selected, currency: price.currency }) ?? "",
                        perLead: formatMoney(price.perLeadPrice, { locale, iso: selected, currency: price.currency }) ?? "",
                        setupFee: formatMoney(price.setupFee, { locale, iso: selected, currency: price.currency }) ?? ""
                      }
                    : {})}
                />
              );
            })}
          </Reveal>
        )}

        <Notice tone="indicative">{t("notice")}</Notice>
        {notice ? (
          <Notice tone="info">
            <BackendText>{notice}</BackendText>
          </Notice>
        ) : null}
      </Section>

      <Reveal as="div">
        <Section title={t("criteria.title")} lead={t("criteria.lead")} tone="muted">
          <BillableCriteriaList criteria={billableLeadCriteria(locale)} />
        </Section>
      </Reveal>
    </>
  );
}
