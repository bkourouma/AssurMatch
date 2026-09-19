import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, toLocale, type AppLocale } from "../../../../i18n/routing";
import { Link } from "../../../../i18n/navigation";
import { EntrySelector } from "../../../components/site/entry-selector";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { Section } from "../../../components/ui/section";
import { getEntrySelectorData } from "../../../content/entry-selector-data";
import { getGuide, guideSlugs } from "../../../content/guides";
import { buildMetadata, localeUrl } from "../../../lib/seo";
import type { PageMetadata } from "../../../lib/seo";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => guideSlugs().map((slug) => ({ locale, slug })));
}

type PageParams = { locale: string; slug: string };

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<PageMetadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = toLocale(rawLocale);
  const guide = getGuide(locale, slug);
  const t = await getTranslations({ locale, namespace: "Guides" });
  return buildMetadata({
    title: guide?.title ?? t("title"),
    description: guide?.description ?? t("description"),
    href: "/guides/[slug]",
    locale,
    params: { slug }
  });
}

export default async function GuidePage({ params }: { params: Promise<PageParams> }) {
  const { locale: rawLocale, slug } = await params;
  const locale: AppLocale = toLocale(rawLocale);
  setRequestLocale(locale);
  const guide = getGuide(locale, slug);
  if (!guide) notFound();

  const t = await getTranslations("Guides");
  const common = await getTranslations("Common");
  const selector = await getEntrySelectorData();

  return (
    <>
      <div className="am-container">
        <Breadcrumb
          label={common("breadcrumbLabel")}
          items={[
            { name: common("home"), url: localeUrl(locale, "/") },
            { name: t("breadcrumb"), url: localeUrl(locale, "/guides") },
            { name: guide.title, url: localeUrl(locale, "/guides/[slug]", { slug: guide.slug }) }
          ]}
        />
      </div>

      <Section headingLevel={1} title={guide.title} lead={guide.description}>
        <p className="pub-meta">{t("updated", { date: guide.updatedAt })}</p>
      </Section>

      {guide.sections.map((section) => (
        <Section key={section.id} id={section.id} title={section.heading}>
          {section.body.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          {section.bullets ? (
            <ul className="pub-list">
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
        </Section>
      ))}

      {selector.countries.length > 0 ? (
        <Section title={common("compareOffers")} tone="brand">
          <EntrySelector countries={selector.countries} products={selector.products} defaultCountry={selector.defaultCountry} />
        </Section>
      ) : null}

      <div className="am-container">
        <Link href="/guides">{t("backToGuides")}</Link>
      </div>
    </>
  );
}
