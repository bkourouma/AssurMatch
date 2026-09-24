import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale, type AppLocale } from "../../../i18n/routing";
import { EntrySelector } from "../../components/site/entry-selector";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Hero } from "../../components/ui/hero";
import { JsonLd } from "../../components/ui/json-ld";
import { Section } from "../../components/ui/section";
import { Reveal } from "../../components/motion/reveal";
import { getEntrySelectorData } from "../../content/entry-selector-data";
import { listFaq } from "../../content/faq";
import { buildMetadata, faqJsonLd, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";
import "../../styles/pages/institutional.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Faq" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/faq", locale });
}

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale: AppLocale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Faq");
  const common = await getTranslations("Common");
  const items = listFaq(locale);
  const selector = await getEntrySelectorData();

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
              { name: t("breadcrumb"), url: localeUrl(locale, "/faq") }
            ]}
          />
        }
      />

      <Section width="narrow">
        <p className="am-faq-meta">{t("questionCount", { count: items.length })}</p>
        <Reveal stagger className="am-faq">
          {items.map((item) => (
            <details className="am-faq__item" key={item.question}>
              <summary>{item.question}</summary>
              <div className="am-faq__answer">
                <p>{item.answer}</p>
                {item.productKey ? <p className="am-caption">{t("relatedProduct")}</p> : null}
              </div>
            </details>
          ))}
        </Reveal>
      </Section>

      {selector.countries.length > 0 ? (
        <Section tone="muted" title={common("compareOffers")} lead={t("selectorLead")} width="narrow">
          <EntrySelector countries={selector.countries} products={selector.products} defaultCountry={selector.defaultCountry} />
        </Section>
      ) : null}

      <JsonLd data={faqJsonLd(items.map((item) => ({ question: item.question, answer: item.answer })))} />
    </>
  );
}
