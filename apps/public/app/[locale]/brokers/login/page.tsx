import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../i18n/routing";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { Button } from "../../../components/ui/button";
import { Hero } from "../../../components/ui/hero";
import { Icon } from "../../../components/ui/icons";
import { Notice } from "../../../components/ui/notice";
import { Section } from "../../../components/ui/section";
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

  return (
    <>
      <div className="am-container">
        <Breadcrumb
          label={common("breadcrumbLabel")}
          items={[
            { name: common("home"), url: localeUrl(locale, "/") },
            { name: t("breadcrumb"), url: localeUrl(locale, "/brokers/login") }
          ]}
        />
      </div>

      <Hero
        title={t("title")}
        lead={t("lead")}
        actions={
          <Button externalHref={brokerLoginUrl} icon={<Icon name="building" size={20} />}>
            {t("loginCta")}
          </Button>
        }
      />

      <Section title={t("mfa.title")}>
        <Notice tone="info">{t("mfa.body")}</Notice>
      </Section>

      <Section title={t("lostAccess.title")}>
        <p>{t("lostAccess.body")}</p>
        <div className="am-cluster">
          <Button href="/contact" variant="secondary">
            {t("lostAccess.cta")}
          </Button>
        </div>
      </Section>
    </>
  );
}
