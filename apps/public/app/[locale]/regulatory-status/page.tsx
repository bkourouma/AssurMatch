import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale, type AppLocale } from "../../../i18n/routing";
import { getRegulatoryStatusContent, type RegulatoryStatusSection } from "../../content/institutional";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { Card, CardBody } from "../../components/ui/card";
import { Hero } from "../../components/ui/hero";
import { Icon, type IconName } from "../../components/ui/icons";
import { IconTile } from "../../components/ui/icon-tile";
import { Notice } from "../../components/ui/notice";
import { Section } from "../../components/ui/section";
import { Reveal } from "../../components/motion/reveal";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";
import "../../styles/pages/institutional.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "RegulatoryStatus" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/regulatory-status", locale });
}

/**
 * One regulated topic, rendered as a card inside its own band. The `id` of the editorial section is
 * kept on the band: `#remuneration`, `#classement`, `#offres-sponsorisees` and `#prix-indicatif` are
 * stable anchors that the footer, the FAQ and external links point at.
 */
function RegulatorySection({
  section,
  icon,
  tone,
  verifyLabel
}: {
  section: RegulatoryStatusSection;
  icon: IconName;
  tone?: "muted";
  verifyLabel: string;
}) {
  return (
    <Section id={section.id} className="am-inst-anchor" {...(tone ? { tone } : {})}>
      <Reveal>
        <Card padding="lg" className="am-inst-card">
          <div className="am-inst-card__head">
            <IconTile name={icon} size="lg" />
            <h2 className="am-inst-card__title">{section.heading}</h2>
          </div>
          <CardBody>
            <p>
              <strong>{section.summary}</strong>
            </p>
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
            <p>
              <em>
                {verifyLabel} {section.howToVerify}
              </em>
            </p>
          </CardBody>
        </Card>
      </Reveal>
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
        kicker={t("kicker")}
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
      />

      <nav className="am-inpagenav" aria-label={t("navLabel")}>
        <div className="am-container">
          <ul className="am-inpagenav__list">
            {sections.map((entry) => (
              <li key={entry.section.id}>
                <a className="am-inpagenav__link" href={`#${entry.section.id}`}>
                  <Icon name={entry.icon} size={16} />
                  {entry.section.heading}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {sections.map((entry, index) => (
        <RegulatorySection
          key={entry.section.id}
          section={entry.section}
          icon={entry.icon}
          verifyLabel={t("verifyLabel")}
          {...(index % 2 === 1 ? { tone: "muted" as const } : {})}
        />
      ))}

      <Section id={content.regionalFramework.id} className="am-inst-anchor">
        <Reveal>
          <Notice tone="info" title={content.regionalFramework.heading}>
            {content.regionalFramework.body.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </Notice>
        </Reveal>
      </Section>

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
