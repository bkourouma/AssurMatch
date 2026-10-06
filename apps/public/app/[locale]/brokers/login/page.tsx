import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../i18n/routing";
import { Link } from "../../../../i18n/navigation";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { Button } from "../../../components/ui/button";
import { Card } from "../../../components/ui/card";
import { Hero } from "../../../components/ui/hero";
import { Icon } from "../../../components/ui/icons";
import { Section } from "../../../components/ui/section";
import { brokerLoginUrl } from "../../../lib/site-config";
import { buildMetadata, localeUrl } from "../../../lib/seo";
import type { PageMetadata } from "../../../lib/seo";

/**
 * SITE-411: the broker portal is a separate, authenticated application. This page never hard-codes
 * its route prefix - a guardrail test (frontend-separation.spec.ts) forbids the public app from
 * containing the other app's base segment as a literal string - so the sign-in button is always built
 * from `brokerLoginUrl` in `app/lib/site-config.ts`.
 *
 * The navy sign says where the visitor is; a plain light plate on it carries the one action (leave
 * for the portal) with the two-factor requirement stated first. Nothing here signs anyone in.
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

  const plate = (
    <Card className="am-loginplate" padding="lg">
      <div className="am-loginplate__head">
        <span className="am-icontile" aria-hidden="true">
          <Icon name="lock" size={22} />
        </span>
        <h2 className="am-loginplate__title">{t("mfa.title")}</h2>
      </div>
      <p className="am-loginplate__body">{t("mfa.body")}</p>
      <Button externalHref={brokerLoginUrl} size="lg" fullWidth iconAfter={<Icon name="arrow-right" size={20} />}>
        {t("loginCta")}
      </Button>
      <ul className="am-loginplate__links">
        <li>
          <Link href="/brokers/apply">{brokers("hero.applyCta")}</Link>
        </li>
        <li>
          <Link href="/brokers/pricing">{pricing("title")}</Link>
        </li>
      </ul>
    </Card>
  );

  return (
    <>
      <Hero
        className="am-brokers-sign am-login-sign"
        title={t("title")}
        lead={t("lead")}
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: brokers("breadcrumb"), url: localeUrl(locale, "/brokers") },
              { name: t("breadcrumb"), url: localeUrl(locale, "/brokers/login") }
            ]}
          />
        }
        aside={plate}
      />

      <Section className="am-brokers-split" title={t("lostAccess.title")}>
        <div className="am-brokers-split__body">
          <p className="am-brokers-text">{t("lostAccess.body")}</p>
          <div className="am-cluster">
            <Button href="/contact" variant="secondary">
              {t("lostAccess.cta")}
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
