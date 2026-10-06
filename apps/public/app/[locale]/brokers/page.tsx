import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../i18n/routing";
import { Link } from "../../../i18n/navigation";
import { LeadExampleCard } from "../../components/brokers/example-lead-card";
import { PlanComparison } from "../../components/brokers/plan-comparison";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { Directory } from "../../components/ui/directory";
import { Hero } from "../../components/ui/hero";
import { Icon, type IconName } from "../../components/ui/icons";
import { Route } from "../../components/ui/route-line";
import { Section } from "../../components/ui/section";
import { brokerContent, brokerPlans, partnerFaq } from "../../content/brokers";
import { brokerLoginUrl } from "../../lib/site-config";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";

/**
 * SITE-408: broker acquisition landing page. The navy sign states the proposition and its two
 * actions; then the three plans side by side, an example of what a broker receives (one plain,
 * labelled example record), the separate portal, what AssurMatch expects from a partner, how an
 * application unfolds (a route whose stops are the compliance team's own steps), the FAQ and a
 * closing sign that repeats the two actions.
 */

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Brokers" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/brokers", locale });
}

/** Icon per expectation line, in the order `partnerExpectations` lists them: licence, response
 * discipline, price honesty, consent (spec 050 content/05). */
const EXPECTATION_ICONS: readonly IconName[] = ["badge-check", "clock", "scale", "shield-check"];

export default async function BrokersPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Brokers");
  const common = await getTranslations("Common");
  const apply = await getTranslations("BrokerApply");
  const received = await getTranslations("BrokerApplyConfirmation.received");
  const login = await getTranslations("BrokerLogin");

  const content = brokerContent(locale);
  const plans = brokerPlans(locale);
  const faq = partnerFaq(locale);

  const actions = (
    <>
      <Button href="/brokers/apply" size="lg" icon={<Icon name="building" size={20} />}>
        {t("hero.applyCta")}
      </Button>
      <Button variant="secondary" size="lg" externalHref={brokerLoginUrl} iconAfter={<Icon name="arrow-right" size={20} />}>
        {t("hero.loginCta")}
      </Button>
    </>
  );

  return (
    <>
      <Hero
        className="am-brokers-sign"
        size="lg"
        title={t("title")}
        lead={t("hero.lead")}
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: t("breadcrumb"), url: localeUrl(locale, "/brokers") }
            ]}
          />
        }
        actions={actions}
      />

      <Section title={t("plans.title")} lead={t("plans.lead")}>
        <PlanComparison
          plans={plans}
          labels={{
            cornerLabel: t("plans.cornerLabel"),
            positioning: t("plans.positioning"),
            audience: t("plans.audience"),
            features: t("plans.features"),
            includesPrefix: (planName) => t("plans.includesPrefix", { plan: planName })
          }}
        />
        <p className="am-brokers-more">
          <Link href="/brokers/pricing">
            {t("plans.compareDetails")}
            <Icon name="arrow-right" size={18} />
          </Link>
        </p>
      </Section>

      <Section className="am-brokers-split" tone="muted" title={t("lead.title")} lead={t("lead.lead")}>
        <div className="am-brokers-split__body">
          <LeadExampleCard
            badgeLabel={t("lead.badgeLabel")}
            disclaimer={t("lead.disclaimer")}
            reference={{ label: t("lead.fields.reference"), value: t("lead.values.reference") }}
            country={{ label: t("lead.fields.country"), value: t("lead.values.country") }}
            product={{ label: t("lead.fields.product"), value: t("lead.values.product") }}
            city={{ label: t("lead.fields.city"), value: t("lead.values.city") }}
            budget={{ label: t("lead.fields.budget"), value: t("lead.values.budget") }}
            channel={{ label: t("lead.fields.channel"), value: t("lead.values.channel") }}
            consent={{ label: t("lead.fields.consent"), value: t("lead.values.consent") }}
          />
        </div>
      </Section>

      {/* The portal is a separate, authenticated application: no picture of it, one row that leads there. */}
      <Section className="am-brokers-split" title={t("portal.title")} lead={t("portal.lead")}>
        <div className="am-brokers-split__body">
          <Directory
            label={t("portal.title")}
            items={[
              {
                key: "login",
                title: t("hero.loginCta"),
                meta: login("mfa.title"),
                icon: "lock",
                externalHref: brokerLoginUrl
              }
            ]}
          />
        </div>
      </Section>

      <Section className="am-brokers-split" tone="muted" title={t("expectations.title")}>
        <div className="am-brokers-split__body">
          <ul className="am-brokerlist am-brokerlist--icons">
            {content.partnerExpectations.map((expectation, index) => (
              <li key={expectation}>
                <Icon name={EXPECTATION_ICONS[index] ?? "badge-check"} size={22} />
                <span>{expectation}</span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* How an application unfolds: the stops are the compliance team's own steps, the same sentences
          the confirmation page shows. None of them confirms anything, so none of them is green. */}
      <Section className="am-brokers-split" title={apply("title")} lead={apply("lead")}>
        <div className="am-brokers-split__body">
          <Route
            className="am-brokers-route"
            orientation="vertical"
            stops={[
              { key: "submit", title: apply("form.submit") },
              { key: "review", title: received("steps.review") },
              { key: "licence", title: received("steps.licenceCheck") },
              { key: "contact", title: received("steps.contact") }
            ]}
          />
          <p className="am-brokers-note">{received("noDelay")}</p>
        </div>
      </Section>

      <Section className="am-brokers-split" tone="muted" title={t("faq.title")}>
        <div className="am-brokers-split__body am-faq">
          {faq.map((item) => (
            <details className="am-faq__item" key={item.id}>
              <summary>{item.question}</summary>
              <p className="am-faq__answer">{item.answer}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section className="am-brokers-closing" tone="navy" title={t("closing.title")} lead={t("closing.lead")} actions={<div className="am-cluster">{actions}</div>}>
        {null}
      </Section>
    </>
  );
}
