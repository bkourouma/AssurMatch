import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../i18n/routing";
import { LeadExampleCard } from "../../components/brokers/example-lead-card";
import { PlanComparison } from "../../components/brokers/plan-comparison";
import { PortalMock } from "../../components/brokers/portal-mock";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { Card, CardBody, CardHeader } from "../../components/ui/card";
import { Hero } from "../../components/ui/hero";
import { Icon, type IconName } from "../../components/ui/icons";
import { IconTile } from "../../components/ui/icon-tile";
import { Section } from "../../components/ui/section";
import { Reveal } from "../../components/motion/reveal";
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

/** Icon per expectation line, in the order `partnerExpectations` lists them (PRD: licence, capacity, consent). */
const EXPECTATION_ICONS: readonly IconName[] = ["badge-check", "clock", "shield-check"];

export default async function BrokersPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Brokers");
  const common = await getTranslations("Common");

  const content = brokerContent(locale);
  const plans = brokerPlans(locale);

  return (
    <>
      <Hero
        tone="navy"
        size="lg"
        kicker={t("hero.kicker")}
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

      <Reveal as="div">
        <Section title={t("plans.title")} lead={t("plans.lead")}>
          <PlanComparison
            plans={plans}
            labels={{
              cornerLabel: t("plans.cornerLabel"),
              positioning: t("plans.positioning"),
              audience: t("plans.audience"),
              features: t("plans.features"),
              compareDetails: t("plans.compareDetails"),
              includesPrefix: (planName) => t("plans.includesPrefix", { plan: planName })
            }}
          />
        </Section>
      </Reveal>

      <Reveal as="div">
        <Section title={t("lead.title")} lead={t("lead.lead")} tone="muted">
          <LeadExampleCard
            badgeLabel={t("lead.badgeLabel")}
            disclaimer={t("lead.disclaimer")}
            countryFlag="🇨🇮"
            reference={{ label: t("lead.fields.reference"), value: t("lead.values.reference") }}
            country={{ label: t("lead.fields.country"), value: t("lead.values.country") }}
            product={{ label: t("lead.fields.product"), value: t("lead.values.product") }}
            city={{ label: t("lead.fields.city"), value: t("lead.values.city") }}
            budget={{ label: t("lead.fields.budget"), value: t("lead.values.budget") }}
            channel={{ label: t("lead.fields.channel"), value: t("lead.values.channel") }}
            consent={{ label: t("lead.fields.consent"), value: t("lead.values.consent") }}
          />
        </Section>
      </Reveal>

      <Reveal as="div">
        <Section title={t("portal.title")} lead={t("portal.lead")}>
          <PortalMock caption={t("portal.caption")} />
        </Section>
      </Reveal>

      <Reveal as="div">
        <Section title={t("expectations.title")} tone="muted">
          <Reveal as="ul" stagger className="am-grid am-grid--3">
            {content.partnerExpectations.map((expectation, index) => (
              <Card as="li" key={expectation}>
                <CardHeader>
                  <IconTile name={EXPECTATION_ICONS[index] ?? "badge-check"} />
                </CardHeader>
                <CardBody>
                  <p>{expectation}</p>
                </CardBody>
              </Card>
            ))}
          </Reveal>
        </Section>
      </Reveal>

      <Reveal as="div">
        <Section title={t("closing.title")} lead={t("closing.lead")} tone="brand" align="center">
          <div className="am-cluster am-closingcta">
            <Button href="/brokers/apply" icon={<Icon name="building" size={20} />}>
              {t("hero.applyCta")}
            </Button>
            <Button variant="secondary" externalHref={brokerLoginUrl} iconAfter={<Icon name="arrow-right" size={20} />}>
              {t("hero.loginCta")}
            </Button>
          </div>
        </Section>
      </Reveal>
    </>
  );
}
