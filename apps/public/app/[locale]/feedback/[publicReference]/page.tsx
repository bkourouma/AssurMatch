import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../../i18n/routing";
import { SatisfactionSurveyForm, type SatisfactionSurveyFormLabels } from "../../../components/tracking/satisfaction-survey-form";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { EmptyState } from "../../../components/ui/empty-state";
import { Hero } from "../../../components/ui/hero";
import { Section } from "../../../components/ui/section";
import { getSatisfactionSurvey } from "../../../lib/public-api";
import { buildMetadata, localeUrl } from "../../../lib/seo";
import type { PageMetadata } from "../../../lib/seo";
import "../../../styles/pages/journey.css";

/**
 * Spec 054 US5: `/avis/[ref]` and `/en/feedback/[ref]`, the link of the satisfaction e-mail. The
 * survey is read with its token (`GET /satisfaction-surveys/:ref?token=`, no-store); a missing,
 * expired, used or wrong token shows one neutral message. Never indexed, no referrer.
 */
type SearchParams = Record<string, string | string[] | undefined>;
type PageParams = { locale: string; publicReference: string };

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<PageMetadata> {
  const { locale: rawLocale, publicReference } = await params;
  const locale = toLocale(rawLocale);
  const t = await getTranslations({ locale, namespace: "Feedback" });
  return {
    ...buildMetadata({
      title: t("title", { reference: publicReference }),
      description: t("description"),
      href: "/feedback/[publicReference]",
      params: { publicReference },
      locale,
      noindex: true
    }),
    referrer: "no-referrer"
  };
}

export default async function SatisfactionFeedbackPage({
  params,
  searchParams
}: {
  params: Promise<PageParams>;
  searchParams?: Promise<SearchParams>;
}) {
  const { locale: rawLocale, publicReference } = await params;
  const locale = toLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations("Feedback");
  const common = await getTranslations("Common");
  const query = searchParams ? await searchParams : {};
  const tokenParam = Array.isArray(query.token) ? query.token[0] : query.token;
  const token = tokenParam && /^[A-Za-z0-9_-]{16,}$/.test(tokenParam) ? tokenParam : undefined;
  const survey = token ? await getSatisfactionSurvey(publicReference, token) : "unavailable";

  const labels: SatisfactionSurveyFormLabels = {
    ratingLegend: t("ratingLegend"),
    ratings: [t("rating.1"), t("rating.2"), t("rating.3"), t("rating.4"), t("rating.5")],
    ratingRequired: t("ratingRequired"),
    comment: t("comment"),
    commentHint: t("commentHint"),
    flaggedConcern: t("flaggedConcern"),
    flaggedConcernHint: t("flaggedConcernHint"),
    submit: t("submit"),
    sending: t("sending"),
    successTitle: t("successTitle"),
    successBody: t("successBody"),
    unavailableTitle: t("unavailableTitle"),
    unavailableBody: t("unavailableBody"),
    rateLimited: t("rateLimited"),
    error: t("error")
  };

  return (
    <>
      <Hero
        kicker={t("kicker")}
        title={t("title", { reference: publicReference })}
        lead={t("lead")}
        size="sm"
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: t("breadcrumb"), url: localeUrl(locale, "/feedback/[publicReference]", { publicReference }) }
            ]}
          />
        }
      />
      <Section>
        <div className="am-stack am-stack--lg am-j-column">
          {token && survey === "available" ? (
            <div className="am-j-panel">
              <SatisfactionSurveyForm publicReference={publicReference} token={token} labels={labels} />
            </div>
          ) : (
            <EmptyState
              icon="lock"
              tone="muted"
              align="center"
              title={t("unavailableTitle")}
              description={survey === "error" ? t("error") : t("unavailableBody")}
            />
          )}
        </div>
      </Section>
    </>
  );
}
