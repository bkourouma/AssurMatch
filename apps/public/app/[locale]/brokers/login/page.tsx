import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../i18n/routing";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { Button } from "../../../components/ui/button";
import { Icon } from "../../../components/ui/icons";
import { IconTile } from "../../../components/ui/icon-tile";
import { Notice } from "../../../components/ui/notice";
import { Section } from "../../../components/ui/section";
import { Reveal } from "../../../components/motion/reveal";
import { brokerLoginUrl } from "../../../lib/site-config";
import { buildMetadata, localeUrl } from "../../../lib/seo";
import type { PageMetadata } from "../../../lib/seo";

/**
 * SITE-411: the broker portal is a separate, authenticated application. This page never hard-codes
 * its route prefix - a guardrail test (frontend-separation.spec.ts) forbids the public app from
 * containing the other app's base segment as a literal string - so the sign-in button is always built
 * from `brokerLoginUrl` in `app/lib/site-config.ts`.
 */

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "BrokerLogin" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/brokers/login", locale });
}

export default async function BrokerLoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("BrokerLogin");
  const common = await getTranslations("Common");
  const brokers = await getTranslations("Brokers");
  const pricing = await getTranslations("BrokerPricing");

  return (
    <>
      {/* No hero on this page, so the trail gets the standalone bar (`.am-breadcrumbbar`, chrome.css)
          rather than sitting flush against the header. */}
      <div className="am-breadcrumbbar am-container">
        <Breadcrumb
          label={common("breadcrumbLabel")}
          items={[
            { name: common("home"), url: localeUrl(locale, "/") },
            { name: t("breadcrumb"), url: localeUrl(locale, "/brokers/login") }
          ]}
        />
      </div>

      <Section spacing="default">
        <Reveal as="div" from="scale">
          <div className="am-logincard">
            <IconTile name="lock" size="lg" className="am-logincard__icon" />
            <h1 className="am-logincard__title">{t("title")}</h1>
            <p className="am-logincard__lead">{t("lead")}</p>

            <Notice tone="info" title={t("mfa.title")}>
              {t("mfa.body")}
            </Notice>

            <div className="am-logincard__actions">
              <Button externalHref={brokerLoginUrl} fullWidth icon={<Icon name="building" size={20} />}>
                {t("loginCta")}
              </Button>
              <div className="am-cluster am-closingcta">
                <Button href="/brokers/apply" variant="tertiary" size="sm">
                  {brokers("hero.applyCta")}
                </Button>
                <Button href="/brokers/pricing" variant="tertiary" size="sm">
                  {pricing("title")}
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      <Section title={t("lostAccess.title")} tone="muted" align="center">
        <p className="am-lead">{t("lostAccess.body")}</p>
        <div className="am-cluster am-closingcta">
          <Button href="/contact" variant="secondary">
            {t("lostAccess.cta")}
          </Button>
        </div>
      </Section>
    </>
  );
}
