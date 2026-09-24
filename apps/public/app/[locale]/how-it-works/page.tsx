import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "../../../i18n/navigation";
import { toLocale, type AppLocale } from "../../../i18n/routing";
import { getHowItWorksContent } from "../../content/institutional";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { Card, CardBody, CardFooter, CardTitle } from "../../components/ui/card";
import { Hero } from "../../components/ui/hero";
import { Icon, type IconName } from "../../components/ui/icons";
import { IconTile } from "../../components/ui/icon-tile";
import { Section } from "../../components/ui/section";
import { Reveal } from "../../components/motion/reveal";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";
import "../../styles/pages/institutional.css";

/** One glyph per canonical step, in the order the editorial content declares them. */
const STEP_ICONS: readonly IconName[] = ["search", "file-text", "handshake"];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "HowItWorks" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/how-it-works", locale });
}

export default async function HowItWorksPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale: AppLocale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("HowItWorks");
  const common = await getTranslations("Common");
  const content = getHowItWorksContent(locale);

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
              { name: t("breadcrumb"), url: localeUrl(locale, "/how-it-works") }
            ]}
          />
        }
        actions={
          <Button href="/countries" icon={<Icon name="search" size={20} />}>
            {common("compareOffers")}
          </Button>
        }
      />

      <Section title={t("stepsHeading")} lead={t("stepsLead")}>
        <Reveal as="ol" stagger className="am-timeline">
          {content.steps.map((step, index) => (
            <li className="am-timeline__item" key={step.id} id={step.id}>
              <span className="am-timeline__marker" aria-hidden="true">
                {index + 1}
              </span>
              <Card className="am-timeline__card" padding="lg">
                <div className="am-timeline__head">
                  <IconTile name={STEP_ICONS[index] ?? "check-circle"} size="lg" />
                  <CardTitle className="am-timeline__title">{step.heading}</CardTitle>
                </div>
                <CardBody>
                  {step.body.map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex}>{paragraph}</p>
                  ))}
                </CardBody>
              </Card>
            </li>
          ))}
        </Reveal>
      </Section>

      <Section tone="muted" kicker={t("notDoneKicker")} title={content.notDone.heading} id={content.notDone.id}>
        <Reveal>
          <Card padding="lg">
            <CardBody>
              {content.notDone.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              {content.notDone.bullets ? (
                <ul className="am-xlist">
                  {content.notDone.bullets.map((bullet) => (
                    <li key={bullet}>
                      <Icon name="x-circle" size={18} />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardBody>
          </Card>
        </Reveal>
      </Section>

      <Section kicker={t("linksKicker")} title={t("linksHeading")} lead={t("linksLead")}>
        <Reveal as="ul" stagger className="am-linkcards">
          <Card as="li" interactive padding="lg" className="am-linkcard">
            <IconTile name="scale" size="lg" />
            <CardTitle as="h3">
              <Link href="/regulatory-status">{t("seeRegulatoryStatus")}</Link>
            </CardTitle>
            <CardBody>
              <p>{t("seeRegulatoryStatusHint")}</p>
            </CardBody>
            <CardFooter>
              <span className="am-cardgo" aria-hidden="true">
                {t("openLink")}
                <Icon name="arrow-right" size={18} />
              </span>
            </CardFooter>
          </Card>
          <Card as="li" interactive padding="lg" className="am-linkcard">
            <IconTile name="globe" size="lg" />
            <CardTitle as="h3">
              <Link href="/countries">{t("compareCountries")}</Link>
            </CardTitle>
            <CardBody>
              <p>{t("compareCountriesHint")}</p>
            </CardBody>
            <CardFooter>
              <span className="am-cardgo" aria-hidden="true">
                {t("openLink")}
                <Icon name="arrow-right" size={18} />
              </span>
            </CardFooter>
          </Card>
        </Reveal>
      </Section>
    </>
  );
}
