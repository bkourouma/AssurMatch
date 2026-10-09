import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../i18n/routing";
import { TrackingLinkForm, type TrackingLinkFormLabels } from "../../components/tracking/tracking-link-form";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Hero } from "../../components/ui/hero";
import { Notice } from "../../components/ui/notice";
import { Section } from "../../components/ui/section";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";
import "../../styles/pages/journey.css";

/**
 * Spec 054 US2: `/suivi` and `/en/track`. The visitor enters a reference and an e-mail and always
 * reads the same neutral confirmation (FR-004). Never indexed, no referrer (next.config.ts).
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Tracking" });
  return {
    ...buildMetadata({ title: t("title"), description: t("description"), href: "/track", locale, noindex: true }),
    referrer: "no-referrer"
  };
}

export default async function TrackingLinkPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Tracking");
  const common = await getTranslations("Common");

  const labels: TrackingLinkFormLabels = {
    reference: t("reference"),
    referenceHint: t("referenceHint"),
    email: t("email"),
    honeypot: t("honeypot"),
    requiredMark: t("requiredMark"),
    invalidReference: t("invalidReference"),
    invalidEmail: t("invalidEmail"),
    submit: t("submit"),
    sending: t("sending"),
    confirmationTitle: t("confirmationTitle"),
    confirmationBody: t("confirmationBody"),
    again: t("again"),
    rateLimited: t("rateLimited"),
    error: t("error")
  };

  return (
    <>
      <Hero
        kicker={t("kicker")}
        title={t("title")}
        lead={t("lead")}
        size="sm"
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: t("breadcrumb"), url: localeUrl(locale, "/track") }
            ]}
          />
        }
      />
      <Section tone="muted">
        <div className="am-stack am-stack--lg am-j-column am-sheet">
          <div className="am-j-panel">
            <TrackingLinkForm labels={labels} />
          </div>
          <Notice tone="info">{t("privacy")}</Notice>
        </div>
      </Section>
    </>
  );
}
