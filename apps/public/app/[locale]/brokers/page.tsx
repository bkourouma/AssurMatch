import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../i18n/routing";
import { LeadExampleCard } from "../../components/brokers/example-lead-card";
import { PlanComparison } from "../../components/brokers/plan-comparison";
import { PortalMock } from "../../components/brokers/portal-mock";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { Hero } from "../../components/ui/hero";
import { Icon } from "../../components/ui/icons";
import { Section } from "../../components/ui/section";
import { brokerContent, brokerPlans } from "../../content/brokers";
import { brokerLoginUrl } from "../../lib/site-config";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";

/**
 * SITE-408: broker acquisition landing page. Explains the proposition to a prospective partner
 * broker, compares the three plans, shows an anonymised example of what a broker receives, and links
 * to the application form and to the (separate, authenticated) broker portal.
 */

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Brokers" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/brokers", locale });
}

export default async function BrokersPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Brokers");
  const common = await getTranslations("Common");

  const content = brokerContent(locale);
  const plans = brokerPlans(locale);

  const leadFields = [
    { label: t("lead.fields.reference"), value: t("lead.values.reference") },
    { label: t("lead.fields.country"), value: t("lead.values.country") },
    { label: t("lead.fields.product"), value: t("lead.values.product") },
    { label: t("lead.fields.city"), value: t("lead.values.city") },
    { label: t("lead.fields.budget"), value: t("lead.values.budget") },
    { label: t("lead.fields.channel"), value: t("lead.values.channel") },
    { label: t("lead.fields.consent"), value: t("lead.values.consent") }
  ];

  return (
    <>
      <div className="am-container">
        <Breadcrumb
          label={common("breadcrumbLabel")}
          items={[
            { name: common("home"), url: localeUrl(locale, "/") },
            { name: t("breadcrumb"), url: localeUrl(locale, "/brokers") }
          ]}
        />
      </div>

      <Hero
        title={t("title")}
        lead={t("hero.lead")}
        actions={
          <>
            <Button href="/brokers/apply" icon={<Icon name="building" size={20} />}>
              {t("hero.applyCta")}
            </Button>
            <Button variant="secondary" externalHref={brokerLoginUrl} iconAfter={<Icon name="arrow-right" size={20} />}>
              {t("hero.loginCta")}
            </Button>
          </>
        }
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
      </Section>

      <Section title={t("lead.title")} lead={t("lead.lead")} tone="muted">
        <LeadExampleCard badgeLabel={t("lead.badgeLabel")} fields={leadFields} />
      </Section>

      <Section title={t("portal.title")} lead={t("portal.lead")}>
        <PortalMock caption={t("portal.caption")} />
      </Section>

      <Section title={t("expectations.title")} tone="muted">
        <ul className="pub-list">
          {content.partnerExpectations.map((expectation) => (
            <li key={expectation}>{expectation}</li>
          ))}
        </ul>
      </Section>

      <Section title={t("closing.title")} lead={t("closing.lead")} tone="brand">
        <div className="am-cluster">
          <Button href="/brokers/apply" icon={<Icon name="building" size={20} />}>
            {t("hero.applyCta")}
          </Button>
          <Button variant="secondary" externalHref={brokerLoginUrl} iconAfter={<Icon name="arrow-right" size={20} />}>
            {t("hero.loginCta")}
          </Button>
        </div>
      </Section>
    </>
  );
}
