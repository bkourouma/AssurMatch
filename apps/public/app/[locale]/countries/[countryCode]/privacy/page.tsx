import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale, type AppLocale } from "../../../../../i18n/routing";
import { Button } from "../../../../components/ui/button";
import { getLegalPage, hasCountryLegalOverride } from "../../../../content/legal";
import { LegalPageView } from "../../../../content/legal-page-view";
import { listPublicCountries } from "../../../../lib/public-api";
import { buildMetadata, localeUrl } from "../../../../lib/seo";
import type { PageMetadata } from "../../../../lib/seo";

const SLUG = "privacy" as const;
const HREF = "/countries/[countryCode]/privacy" as const;
const GLOBAL_HREF = "/privacy" as const;

type PageParams = { locale: string; countryCode: string };

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<PageMetadata> {
  const { locale: rawLocale, countryCode } = await params;
  const locale = toLocale(rawLocale);
  const iso = countryCode.toUpperCase();
  const page = getLegalPage(SLUG, locale, iso);
  const t = await getTranslations({ locale, namespace: "Legal" });
  return buildMetadata({ title: page?.title ?? t("title"), description: page?.description ?? t("description"), href: HREF, locale, params: { countryCode: iso } });
}

export default async function CountryPrivacyPage({ params }: { params: Promise<PageParams> }) {
  const { locale: rawLocale, countryCode } = await params;
  const locale: AppLocale = toLocale(rawLocale);
  setRequestLocale(locale);
  const iso = countryCode.toUpperCase();

  const page = getLegalPage(SLUG, locale, iso);
  if (!page) notFound();

  const t = await getTranslations("Legal");
  const common = await getTranslations("Common");
  const countries = await listPublicCountries();
  const countryName = countries.data.find((country) => country.isoCode.toUpperCase() === iso)?.name ?? iso;
  const hasOverride = hasCountryLegalOverride(SLUG, iso);

  return (
    <LegalPageView
      breadcrumbLabel={common("breadcrumbLabel")}
      breadcrumbItems={[
        { name: common("home"), url: localeUrl(locale, "/") },
        { name: page.title, url: localeUrl(locale, HREF, { countryCode: iso }) }
      ]}
      page={page}
      lastUpdatedLabel={t("lastUpdated", { date: page.updatedAt })}
      placeholdersTitle={t("placeholdersTitle")}
      placeholderNotice={t("placeholderNotice")}
      countryNotice={{
        text: hasOverride ? t("countryNoticeWithOverride", { country: countryName }) : t("countryNoticeFallback", { country: countryName }),
        action: (
          <Button href={GLOBAL_HREF} variant="secondary">
            {t("backToGlobal")}
          </Button>
        )
      }}
    />
  );
}
