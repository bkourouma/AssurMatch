import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale, type AppLocale } from "../../../i18n/routing";
import { guideReadingTimeMinutes, listGuides } from "../../content/guides";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Directory, type DirectoryItem } from "../../components/ui/directory";
import { Hero } from "../../components/ui/hero";
import { productPictogram } from "../../components/ui/pictogram";
import { Section } from "../../components/ui/section";
import { formatDate } from "../../lib/country-format";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";
import "../../styles/pages/institutional.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Guides" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/guides", locale });
}

/**
 * Guides index: one directory row per guide. A guide about one product carries that product's
 * pictogram; the others carry the book. Under the description, the facts a reader weighs before
 * opening it: the product, the reading time and the last update.
 */
export default async function GuidesIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale: AppLocale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Guides");
  const common = await getTranslations("Common");
  const guides = listGuides(locale);
  const productLabel = (key?: string) => (key === "auto" ? t("productAuto") : key === "voyage" ? t("productVoyage") : undefined);

  const rows: DirectoryItem[] = guides.map((guide) => {
    const facts = [
      productLabel(guide.productKey),
      t("readingTime", { minutes: guideReadingTimeMinutes(guide) }),
      t("updated", { date: formatDate(guide.updatedAt, { locale }) })
    ].filter((fact): fact is string => Boolean(fact));
    return {
      key: guide.slug,
      title: guide.title,
      meta: (
        <>
          <span>{guide.description}</span>
          <span className="am-directory__facts">{facts.join(" · ")}</span>
        </>
      ),
      ...(guide.productKey ? { pictogram: productPictogram(guide.productKey) } : { icon: "book-open" as const }),
      href: { pathname: "/guides/[slug]", params: { slug: guide.slug } }
    };
  });

  return (
    <>
      <Hero
        title={t("title")}
        lead={t("lead")}
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: t("breadcrumb"), url: localeUrl(locale, "/guides") }
            ]}
          />
        }
      />

      <Section>
        <Directory items={rows} label={t("title")} columns={2} className="am-guides-dir" />
      </Section>
    </>
  );
}
