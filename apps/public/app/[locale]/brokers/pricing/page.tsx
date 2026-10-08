import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../i18n/routing";
import { BillableCriteriaList } from "../../../components/brokers/billable-criteria-list";
import { PlanPricingCard } from "../../../components/brokers/plan-pricing-card";
import { BackendText } from "../../../components/ui/backend-text";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/empty-state";
import { Hero } from "../../../components/ui/hero";
import { Icon } from "../../../components/ui/icons";
import { Notice } from "../../../components/ui/notice";
import { Section } from "../../../components/ui/section";
import { billableLeadCriteria, billingFaq, brokerPlan, neverIncludedFeatures, type BrokerPlanKey } from "../../../content/brokers";
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
 *
 * The country choice sits on the navy sign: a plain GET form that reloads this page with `?pays=XX`,
 * so it needs no client JavaScript.
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
  const brokers = await getTranslations("Brokers");

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
        className="am-brokers-sign"
        title={t("title")}
        lead={t("lead")}
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: brokers("breadcrumb"), url: localeUrl(locale, "/brokers") },
              { name: t("breadcrumb"), url: localeUrl(locale, "/brokers/pricing") }
            ]}
          />
        }
      >
        {eligibleCountries.length > 0 ? (
          <form className="am-pricing-country" method="get">
            <label className="am-pricing-country__label" htmlFor="am-pricing-country">
              {t("countrySelector.label")}
            </label>
            <div className="am-pricing-country__row">
              <select id="am-pricing-country" className="am-field__control" name="pays" defaultValue={selected}>
                {eligibleCountries.map((country) => (
                  <option key={country.isoCode} value={country.isoCode}>
                    {country.name}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="secondary" iconAfter={<Icon name="arrow-right" size={18} />}>
                {t("countrySelector.submit")}
              </Button>
            </div>
          </form>
        ) : null}
      </Hero>

      {/* The title is what stops the page skipping from the sign's h1 straight to the plans' h3. */}
      <Section title={t("plansTitle")}>
        {/* Who these prices bind, read before the prices themselves; shown in every state. */}
        <Notice tone="indicative" className="am-pricing-notice">
          {t("notice")}
        </Notice>
        {eligibleCountries.length === 0 || noPrices ? (
          <EmptyState title={t("empty.title")} description={t("empty.description")} action={contactAction} />
        ) : (
          <ul className="am-planpanels">
            {PLAN_ORDER.map((key) => {
              const planContent = brokerPlan(locale, key);
              if (!planContent) return null;
              const base = planContent.includesPlan ? brokerPlan(locale, planContent.includesPlan) : undefined;
              const price = priceByPlan.get(key);
              return (
                <PlanPricingCard
                  key={key}
                  planName={planContent.name}
                  positioning={planContent.positioning}
                  audience={planContent.audience}
                  features={planContent.features}
                  {...(base ? { includesNote: brokers("plans.includesPrefix", { plan: base.name }) } : {})}
                  highlighted={key === "pro"}
                  notIncluded={planContent.notIncluded}
                  applyHref={{ pathname: "/brokers/apply", query: { formule: key } }}
                  labels={{
                    monthlySubscription: t("pricing.monthlySubscription"),
                    perLead: t("pricing.perLead"),
                    setupFee: t("pricing.setupFee"),
                    onRequest: t("pricing.onRequest"),
                    notIncludedTitle: t("pricing.notIncludedTitle"),
                    applyCta: t("pricing.applyCta"),
                    audience: brokers("plans.audience"),
                    featuresTitle: brokers("plans.features")
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
          </ul>
        )}

        {notice ? (
          <Notice tone="info" className="am-pricing-notice">
            <BackendText>{notice}</BackendText>
          </Notice>
        ) : null}
      </Section>

      <Section className="am-brokers-split" tone="muted" title={t("criteria.title")} lead={t("criteria.lead")}>
        <div className="am-brokers-split__body">
          <BillableCriteriaList criteria={billableLeadCriteria(locale)} />
          <p className="am-brokers-note">{t("criteria.neverBillable")}</p>
        </div>
      </Section>

      <Section className="am-brokers-split" title={t("neverIncluded.title")}>
        <div className="am-brokers-split__body">
          <ul className="am-brokerlist am-brokerlist--excluded">
            {neverIncludedFeatures(locale).map((item) => (
              <li key={item}>
                <Icon name="minus" size={20} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section className="am-brokers-split" title={t("billingFaq.title")}>
        <div className="am-brokers-split__body am-faq">
          {billingFaq(locale).map((item) => (
            <details className="am-faq__item" key={item.id}>
              <summary>{item.question}</summary>
              <p className="am-faq__answer">{item.answer}</p>
            </details>
          ))}
        </div>
      </Section>
    </>
  );
}
