import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing, toLocale, type AppLocale } from "../../../../i18n/routing";
import { EntrySelector } from "../../../components/site/entry-selector";
import { GuideCard } from "../../../components/institutional/guide-card";
import { Breadcrumb } from "../../../components/ui/breadcrumb";
import { Button } from "../../../components/ui/button";
import { Hero } from "../../../components/ui/hero";
import { Icon } from "../../../components/ui/icons";
import { Section } from "../../../components/ui/section";
import { Reveal } from "../../../components/motion/reveal";
import { getEntrySelectorData } from "../../../content/entry-selector-data";
import { getGuide, guideSlugs, listGuides } from "../../../content/guides";
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

  return (
    <>
      <Hero
        kicker={t("kicker")}
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
      />

      <Section width="narrow">
        <p className="am-reading__meta">
          <Icon name="calendar" size={16} />
          {t("updated", { date: formatDate(guide.updatedAt, { locale }) })}
        </p>

        {guide.sections.length > 1 ? (
          <nav className="am-legal-toc" aria-label={t("contents")}>
            <p className="am-legal-toc__title">
              <Icon name="list" size={16} />
              {t("contents")}
            </p>
            <ol className="am-legal-toc__list">
              {guide.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.heading}</a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div className="am-reading">
          {guide.sections.map((section) => (
            <section className="am-reading__section" key={section.id} id={section.id}>
              <h2>{section.heading}</h2>
              {section.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              {section.bullets ? (
                <ul className="am-bullets">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>
                      <Icon name="check" size={18} />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        <div className="am-cluster">
          <Button href="/guides" variant="tertiary" icon={<Icon name="arrow-left" size={18} />}>
            {t("backToGuides")}
          </Button>
        </div>
      </Section>

      {selector.countries.length > 0 ? (
        <Section tone="muted" title={common("compareOffers")} lead={t("selectorLead")} width="narrow">
          <EntrySelector countries={selector.countries} products={selector.products} defaultCountry={selector.defaultCountry} />
        </Section>
      ) : null}

      {others.length > 0 ? (
        <Section title={t("moreTitle")} spacing="compact">
          <Reveal as="ul" stagger className="am-guidecards am-guidecards--three">
            {others.map((entry) => (
              <GuideCard
                key={entry.slug}
                slug={entry.slug}
                title={entry.title}
                description={entry.description}
                meta={t("updated", { date: formatDate(entry.updatedAt, { locale }) })}
                readLabel={t("read")}
              />
            ))}
          </Reveal>
        </Section>
      ) : null}
    </>
  );
}
