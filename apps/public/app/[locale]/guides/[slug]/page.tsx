import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, toLocale, type AppLocale } from "../../../../i18n/routing";
import { EntrySelector } from "../../../components/site/entry-selector";
import { ArticleToc } from "../../../components/institutional/article-toc";
import { GuideDisclaimer, GuideKeyPoints, GuideMistakes } from "../../../components/institutional/guide-blocks";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { Button } from "../../../components/ui/button";
import { Directory, type DirectoryItem } from "../../../components/ui/directory";
import { Hero } from "../../../components/ui/hero";
import { Icon } from "../../../components/ui/icons";
import { productPictogram } from "../../../components/ui/pictogram";
import { Section } from "../../../components/ui/section";
import { getEntrySelectorData } from "../../../content/entry-selector-data";
import { getGuide, guideReadingTimeMinutes, guideSlugs, listGuides } from "../../../content/guides";
import { formatDate } from "../../../lib/country-format";
import { buildMetadata, localeUrl } from "../../../lib/seo";
import type { PageMetadata } from "../../../lib/seo";
import "../../../styles/pages/institutional.css";

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

/**
 * A guide is read, not scanned: the sign carries the title, the lead and the reading facts; the
 * article keeps a 68-character column with the key points first, the sections, the mistakes to
 * avoid and the fixed note. The other guides close the page as directory rows.
 */
export default async function GuidePage({ params }: { params: Promise<PageParams> }) {
  const { locale: rawLocale, slug } = await params;
  const locale: AppLocale = toLocale(rawLocale);
  setRequestLocale(locale);
  const guide = getGuide(locale, slug);
  if (!guide) notFound();

  const t = await getTranslations("Guides");
  const common = await getTranslations("Common");
  const selector = await getEntrySelectorData();
  const others = listGuides(locale)
    .filter((entry) => entry.slug !== guide.slug)
    .slice(0, 3);
  const readingTimeLabel = (entry: typeof guide) => t("readingTime", { minutes: guideReadingTimeMinutes(entry) });
  const hasToc = guide.sections.length > 1;

  const otherRows: DirectoryItem[] = others.map((entry) => ({
    key: entry.slug,
    title: entry.title,
    meta: entry.description,
    ...(entry.productKey ? { pictogram: productPictogram(entry.productKey) } : { icon: "book-open" as const }),
    href: { pathname: "/guides/[slug]", params: { slug: entry.slug } }
  }));

  return (
    <>
      <Hero
        title={guide.title}
        lead={guide.description}
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: t("breadcrumb"), url: localeUrl(locale, "/guides") },
              { name: guide.title, url: localeUrl(locale, "/guides/[slug]", { slug: guide.slug }) }
            ]}
          />
        }
      >
        <p className="am-signmeta">
          <span>
            <Icon name="calendar" size={18} />
            {t("updated", { date: formatDate(guide.updatedAt, { locale }) })}
          </span>
          <span>
            <Icon name="clock" size={18} />
            {readingTimeLabel(guide)}
          </span>
        </p>
      </Hero>

      <Section>
        <div className="am-article" data-toc={hasToc ? "true" : undefined}>
          <GuideKeyPoints title={t("keyPointsTitle")} items={guide.keyPoints} />

          <ArticleToc title={t("contents")} entries={guide.sections} />

          <div className="am-article__body">
            {guide.sections.map((section) => (
              <section className="am-article__section" key={section.id} id={section.id}>
                <h2>{section.heading}</h2>
                {section.body.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
                {section.bullets ? (
                  <ul>
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>

          <GuideMistakes title={t("mistakesTitle")} items={guide.mistakes} />

          <GuideDisclaimer title={t("disclaimerTitle")}>{t("disclaimerBody")}</GuideDisclaimer>

          <div>
            <Button href="/guides" variant="tertiary" icon={<Icon name="arrow-left" size={18} />}>
              {t("backToGuides")}
            </Button>
          </div>
        </div>
      </Section>

      {selector.countries.length > 0 ? (
        <Section tone="muted" title={common("compareOffers")} lead={guide.compareCta ?? t("selectorLead")} width="narrow" className="am-inst-compare">
          <EntrySelector countries={selector.countries} products={selector.products} defaultCountry={selector.defaultCountry} />
        </Section>
      ) : null}

      {otherRows.length > 0 ? (
        <Section title={t("moreTitle")} spacing="compact">
          <Directory items={otherRows} label={t("moreTitle")} />
        </Section>
      ) : null}
    </>
  );
}
