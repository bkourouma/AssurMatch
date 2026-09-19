import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale, type AppLocale } from "../../../i18n/routing";
import { getHowItWorksContent } from "../../content/institutional";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { Section } from "../../components/ui/section";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";

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
      <div className="am-container">
        <Breadcrumb
          label={common("breadcrumbLabel")}
          items={[
            { name: common("home"), url: localeUrl(locale, "/") },
            { name: t("breadcrumb"), url: localeUrl(locale, "/how-it-works") }
          ]}
        />
      </div>

      <Section headingLevel={1} title={t("title")} lead={t("lead")}>
        <ol className="pub-steps">
          {content.steps.map((step, index) => (
            <li className="pub-step" key={step.id} id={step.id}>
              <span className="pub-step__index" aria-hidden="true">
                {index + 1}
              </span>
              <h3>{step.heading}</h3>
              {step.body.map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex}>{paragraph}</p>
              ))}
            </li>
          ))}
        </ol>
      </Section>

      <Section title={content.notDone.heading} tone="muted" id={content.notDone.id}>
        {content.notDone.body.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
        {content.notDone.bullets ? (
          <ul className="pub-list">
            {content.notDone.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title={t("linksHeading")}>
        <div className="am-cluster">
          <Button href="/regulatory-status" variant="secondary">
            {t("seeRegulatoryStatus")}
          </Button>
          <Button href="/countries" variant="secondary">
            {t("compareCountries")}
          </Button>
        </div>
      </Section>
    </>
  );
}
