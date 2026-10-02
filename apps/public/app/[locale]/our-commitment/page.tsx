import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale, type AppLocale } from "../../../i18n/routing";
import { getCommitmentContent } from "../../content/commitment";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { Card, CardBody, CardFooter, CardTitle } from "../../components/ui/card";
import { Hero } from "../../components/ui/hero";
import { Icon } from "../../components/ui/icons";
import { Section } from "../../components/ui/section";
import { Reveal } from "../../components/motion/reveal";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";
import "../../styles/pages/institutional.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Commitment" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/our-commitment", locale });
}

export default async function OurCommitmentPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale: AppLocale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Commitment");
  const common = await getTranslations("Common");
  const content = getCommitmentContent(locale);

  return (
    <>
      <Hero
        kicker={t("kicker")}
        title={t("title")}
        lead={t("subtitle")}
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: t("breadcrumb"), url: localeUrl(locale, "/our-commitment") }
            ]}
          />
        }
        actions={
          <Button href="/countries" icon={<Icon name="search" size={20} />}>
            {common("compareOffers")}
          </Button>
        }
      />

      <Section width="narrow" spacing="compact">
        <p>{content.intro}</p>
      </Section>

      <Section kicker={t("commitmentsKicker")} title={t("commitmentsHeading")}>
        <Reveal as="ul" stagger className="am-grid am-grid--2">
          {content.commitments.map((item) => (
            <Card as="li" padding="lg" key={item.id} id={item.id}>
              <CardTitle as="h3">{item.heading}</CardTitle>
              <CardBody>
                <p>
                  <strong>{item.statement}</strong>
                </p>
                <p className="am-eyebrow">{t("whatItMeansLabel")}</p>
                {item.whatItMeans.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
                <p className="am-eyebrow">{t("howToVerifyLabel")}</p>
                <p>{item.howToVerify}</p>
                <p className="am-eyebrow">{t("limitLabel")}</p>
                <p>{item.limit}</p>
              </CardBody>
            </Card>
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

      <Section title={content.ifSomethingIsWrong.heading} id={content.ifSomethingIsWrong.id}>
        <Reveal>
          <Card padding="lg">
            <CardBody>
              {content.ifSomethingIsWrong.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </CardBody>
            <CardFooter>
              <Button href="/contact" variant="secondary" iconAfter={<Icon name="arrow-right" size={18} />}>
                {t("writeToUs")}
              </Button>
            </CardFooter>
          </Card>
        </Reveal>
      </Section>
    </>
  );
}
