import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale, type AppLocale } from "../../../i18n/routing";
import { listGuides } from "../../content/guides";
import { GuideCard } from "../../components/institutional/guide-card";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Hero } from "../../components/ui/hero";
import { Section } from "../../components/ui/section";
import { Reveal } from "../../components/motion/reveal";
import { formatDate } from "../../lib/country-format";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";
import "../../styles/pages/institutional.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Guides" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/guides", locale });
}

export default async function GuidesIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale: AppLocale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Guides");
  const common = await getTranslations("Common");
  const guides = listGuides(locale);

  return (
    <>
      <Hero
        kicker={t("kicker")}
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
        <Reveal as="ul" stagger className="am-guidecards">
          {guides.map((guide) => (
            <GuideCard
              key={guide.slug}
              slug={guide.slug}
              title={guide.title}
              description={guide.description}
              meta={t("updated", { date: formatDate(guide.updatedAt, { locale }) })}
              readLabel={t("read")}
              titleAs="h2"
            />
          ))}
        </Reveal>
      </Section>
    </>
  );
}
