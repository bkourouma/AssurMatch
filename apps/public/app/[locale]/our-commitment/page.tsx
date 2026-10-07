import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale, type AppLocale } from "../../../i18n/routing";
import { getCommitmentContent } from "../../content/commitment";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { Hero } from "../../components/ui/hero";
import { Icon } from "../../components/ui/icons";
import { Section } from "../../components/ui/section";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";
import "../../styles/pages/institutional.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Commitment" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/our-commitment", locale });
}

/**
 * Our commitment: five commitments as ruled rows. Each one states the promise in the margin and,
 * beside it, what it means, how the visitor can check it and where it stops. The limits that follow
 * are a ruled list; the page ends on what to do when a commitment does not seem to be kept.
 */
export default async function OurCommitmentPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale: AppLocale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Commitment");
  const common = await getTranslations("Common");
  const content = getCommitmentContent(locale);

  return (
    <>
      <Hero
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

      <Section>
        <p className="am-commit-intro">{content.intro}</p>

        <h2 className="am-commit-heading">{t("commitmentsHeading")}</h2>
        <ul className="am-commitments">
          {content.commitments.map((item) => (
            <li className="am-commitment" key={item.id} id={item.id}>
              <div>
                <h3 className="am-commitment__title">{item.heading}</h3>
                <p className="am-commitment__statement">{item.statement}</p>
              </div>
              <dl className="am-commitment__facts">
                <div>
                  <dt className="am-eyebrow">{t("whatItMeansLabel")}</dt>
                  <dd>
                    {item.whatItMeans.map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt className="am-eyebrow">{t("howToVerifyLabel")}</dt>
                  <dd>{item.howToVerify}</dd>
                </div>
                <div>
                  <dt className="am-eyebrow">{t("limitLabel")}</dt>
                  <dd>{item.limit}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </Section>

      <Section tone="muted" title={content.notDone.heading} id={content.notDone.id}>
        <div className="am-scope">
          {content.notDone.body.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          {content.notDone.bullets ? (
            <ul className="am-ruled" data-mark="minus">
              {content.notDone.bullets.map((bullet) => (
                <li key={bullet}>
                  <Icon name="minus" size={20} />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Section>

      <Section title={content.ifSomethingIsWrong.heading} id={content.ifSomethingIsWrong.id} className="am-commit-write">
        {content.ifSomethingIsWrong.body.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
        <Button href="/contact" variant="secondary" iconAfter={<Icon name="arrow-right" size={18} />}>
          {t("writeToUs")}
        </Button>
      </Section>
    </>
  );
}
