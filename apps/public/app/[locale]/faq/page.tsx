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
import type { FaqItem } from "../../content/types";
import { buildMetadata, faqJsonLd, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";
import "../../styles/pages/institutional.css";

/**
 * Groups FAQ items by their `theme`, in the order the themes first appear in `listFaq`. The order is
 * editorial (Le service / Les offres et le score / Ma demande et mes données / Les produits, content/
 * 03-guides-faq-lexique.md §A.3) and is carried by the data itself rather than a hardcoded, locale-
 * specific label list, so it holds for both French and English without duplicating the theme names
 * here.
 */
function groupByTheme(items: readonly FaqItem[]): Array<[string, FaqItem[]]> {
  const groups = new Map<string, FaqItem[]>();
  for (const item of items) {
    const key = item.theme ?? "";
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()];
}

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
  const groups = groupByTheme(items);
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
        {groups.map(([theme, themeItems]) => (
          <section className="am-faq-group" key={theme || "_"}>
            {theme ? <h2 className="am-faq-group__title">{theme}</h2> : null}
            <Reveal stagger className="am-faq">
              {themeItems.map((item) => (
                <details className="am-faq__item" key={item.question}>
                  <summary>{item.question}</summary>
                  <div className="am-faq__answer">
                    <p>{item.answer}</p>
                    {item.productKey ? <p className="am-caption">{t("relatedProduct")}</p> : null}
                  </div>
                </details>
              ))}
            </Reveal>
          </section>
        ))}
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
