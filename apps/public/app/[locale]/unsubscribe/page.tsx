import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../i18n/routing";
import { UnsubscribeForm, type UnsubscribeFormLabels } from "../../components/tracking/unsubscribe-form";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { EmptyState } from "../../components/ui/empty-state";
import { Hero } from "../../components/ui/hero";
import { Section } from "../../components/ui/section";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";
import "../../styles/pages/journey.css";

/**
 * Spec 061 FR-005: `/desinscription` and `/en/unsubscribe`, the opt-out link of the satisfaction
 * survey e-mail. No authentication: the signed token is the proof, and nothing changes until the
 * visitor confirms. Never indexed, no referrer.
 */
type SearchParams = Record<string, string | string[] | undefined>;
type PageParams = { locale: string };

const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<PageMetadata> {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "Unsubscribe" });
  return {
    ...buildMetadata({
      title: t("title"),
      description: t("description"),
      href: "/unsubscribe",
      locale,
      noindex: true
    }),
    referrer: "no-referrer"
  };
}

export default async function UnsubscribePage({
  params,
  searchParams
}: {
  params: Promise<PageParams>;
  searchParams?: Promise<SearchParams>;
}) {
  const { locale: rawLocale } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations("Unsubscribe");
  const common = await getTranslations("Common");
  const query = searchParams ? await searchParams : {};
  const tokenParam = Array.isArray(query.token) ? query.token[0] : query.token;
  const token = tokenParam && tokenParam.length <= 600 && TOKEN_PATTERN.test(tokenParam) ? tokenParam : undefined;

  const labels: UnsubscribeFormLabels = {
    confirm: t("confirm"),
    sending: t("sending"),
    successTitle: t("successTitle"),
    successBody: t("successBody"),
    unavailableTitle: t("unavailableTitle"),
    unavailableBody: t("unavailableBody"),
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
              { name: t("breadcrumb"), url: localeUrl(locale, "/unsubscribe") }
            ]}
          />
        }
      />
      <Section>
        <div className="am-stack am-stack--lg am-j-column">
          {token ? (
            <div className="am-j-panel" data-unsubscribe>
              <UnsubscribeForm token={token} labels={labels} />
            </div>
          ) : (
            <EmptyState icon="lock" tone="muted" align="center" title={t("unavailableTitle")} description={t("unavailableBody")} />
          )}
        </div>
      </Section>
    </>
  );
}
