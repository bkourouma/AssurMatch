import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale, type AppLocale } from "../../../i18n/routing";
import { getLegalPage } from "../../content/legal";
import { LegalPageView } from "../../content/legal-page-view";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";

const SLUG = "legal-notice" as const;
const HREF = "/legal-notice" as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const page = getLegalPage(SLUG, locale);
  const t = await getTranslations({ locale, namespace: "Legal" });
  return buildMetadata({ title: page?.title ?? t("title"), description: page?.description ?? t("description"), href: HREF, locale });
}

export default async function LegalNoticePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale: AppLocale = toLocale((await params).locale);
  setRequestLocale(locale);
  const page = getLegalPage(SLUG, locale);
  if (!page) notFound();
  const t = await getTranslations("Legal");
  const common = await getTranslations("Common");

  return (
    <LegalPageView
      breadcrumbLabel={common("breadcrumbLabel")}
      breadcrumbItems={[
        { name: common("home"), url: localeUrl(locale, "/") },
        { name: page.title, url: localeUrl(locale, HREF) }
      ]}
      page={page}
      lastUpdatedLabel={t("lastUpdated", { date: page.updatedAt })}
      placeholdersTitle={t("placeholdersTitle")}
      placeholderNotice={t("placeholderNotice")}
    />
  );
}
