import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale, type AppLocale } from "../../../i18n/routing";
import { getRegulatoryStatusContent, type RegulatoryStatusSection } from "../../content/institutional";
import type { ContentSection } from "../../content/types";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { Directory } from "../../components/ui/directory";
import { Hero } from "../../components/ui/hero";
import { Icon, type IconName } from "../../components/ui/icons";
import { IconTile } from "../../components/ui/icon-tile";
import { Section } from "../../components/ui/section";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";
import "../../styles/pages/institutional.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "RegulatoryStatus" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/regulatory-status", locale });
}

/**
 * One regulated topic in its own band: the heading and its one-line answer in the margin, the detail
 * and "Comment vérifier" beside it. The `id` of the editorial section is kept on the band:
 * `#remuneration`, `#classement`, `#offres-sponsorisees` and `#prix-indicatif` are stable anchors that
 * the footer, the FAQ and external links point at.
 */
function RegulatoryTopic({
  section,
  icon,
  tone,
  verifyLabel
}: {
  section: RegulatoryStatusSection | ContentSection;
  icon: IconName;
  tone?: "muted";
  verifyLabel?: string;
}) {
  const summary = "summary" in section ? section.summary : undefined;
  const howToVerify = "howToVerify" in section ? section.howToVerify : undefined;
  return (
    <Section id={section.id} {...(tone ? { tone } : {})}>
      <div className="am-topic">
        <div className="am-topic__head">
          <IconTile name={icon} />
          <h2 className="am-topic__title">{section.heading}</h2>
          {summary ? <p className="am-topic__summary">{summary}</p> : null}
        </div>
        <div className="am-topic__body">
          {section.body.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          {section.bullets ? (
            <ul className="am-ruled" data-mark="dot">
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
          {howToVerify && verifyLabel ? (
            <div className="am-topic__verify">
              <p>
                <strong>{verifyLabel}</strong> {howToVerify}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

export default async function RegulatoryStatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale: AppLocale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("RegulatoryStatus");
  const common = await getTranslations("Common");
  const content = getRegulatoryStatusContent(locale);

  const sections: Array<{ section: RegulatoryStatusSection; icon: IconName }> = [
    { section: content.remuneration, icon: "coins" },
    { section: content.ranking, icon: "bar-chart" },
    { section: content.sponsoredOffers, icon: "star" },
    { section: content.indicativePrice, icon: "receipt" }
  ];

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
              { name: t("breadcrumb"), url: localeUrl(locale, "/regulatory-status") }
            ]}
          />
        }
      >
        {/* The four topics of the page, as directory rows on the sign: where each answer is. */}
        <nav className="am-reg-index" aria-label={t("navLabel")}>
          <Directory
            surface="plate"
            columns={2}
            items={sections.map((entry) => ({
              key: entry.section.id,
              title: entry.section.heading,
              icon: entry.icon,
              externalHref: `#${entry.section.id}`
            }))}
          />
        </nav>
      </Hero>

      {sections.map((entry, index) => (
        <RegulatoryTopic
          key={entry.section.id}
          section={entry.section}
          icon={entry.icon}
          verifyLabel={t("verifyLabel")}
          {...(index % 2 === 1 ? { tone: "muted" as const } : {})}
        />
      ))}

      <RegulatoryTopic section={content.regionalFramework} icon="landmark" />

      <Section tone="muted" lead={t("footerLead")}>
        <div className="am-cluster">
          <Button href="/countries" icon={<Icon name="search" size={20} />}>
            {common("compareOffers")}
          </Button>
          <Button href="/contact" variant="secondary">
            {t("writeToUs")}
          </Button>
        </div>
      </Section>
    </>
  );
}
