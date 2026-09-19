import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale, type AppLocale } from "../../../i18n/routing";
import { getRegulatoryStatusContent } from "../../content/institutional";
import type { ContentSection } from "../../content/types";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Section } from "../../components/ui/section";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "RegulatoryStatus" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/regulatory-status", locale });
}

function RegulatorySection({ section, tone }: { section: ContentSection; tone?: "default" | "muted" | "brand" }) {
  return (
    <Section title={section.heading} id={section.id} {...(tone ? { tone } : {})}>
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
  );
}

export default async function RegulatoryStatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale: AppLocale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("RegulatoryStatus");
  const common = await getTranslations("Common");
  const content = getRegulatoryStatusContent(locale);

  return (
    <>
      <div className="am-container">
        <Breadcrumb
          label={common("breadcrumbLabel")}
          items={[
            { name: common("home"), url: localeUrl(locale, "/") },
            { name: t("breadcrumb"), url: localeUrl(locale, "/regulatory-status") }
          ]}
        />
      </div>

      <Section headingLevel={1} title={t("title")} lead={t("lead")}>
        {null}
      </Section>

      <RegulatorySection section={content.remuneration} tone="brand" />
      <RegulatorySection section={content.ranking} />
      <RegulatorySection section={content.sponsoredOffers} tone="muted" />
      <RegulatorySection section={content.indicativePrice} />
    </>
  );
}
