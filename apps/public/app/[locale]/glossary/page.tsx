import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale, type AppLocale } from "../../../i18n/routing";
import { EntrySelector } from "../../components/site/entry-selector";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Hero } from "../../components/ui/hero";
import { Section } from "../../components/ui/section";
import { getEntrySelectorData } from "../../content/entry-selector-data";
import { listGlossary } from "../../content/glossary";
import type { GlossaryEntry } from "../../content/types";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";
import "../../styles/pages/institutional.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Glossary" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/glossary", locale });
}

/** Anchor id for one glossary term: lower-cased, accents stripped, everything but letters/digits becomes a hyphen. */
function termId(term: string): string {
  return term
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function groupByLetter(entries: readonly GlossaryEntry[]): Array<[string, GlossaryEntry[]]> {
  const groups = new Map<string, GlossaryEntry[]>();
  for (const entry of entries) {
    const letter = termId(entry.term).charAt(0).toUpperCase() || "#";
    const bucket = groups.get(letter);
    if (bucket) bucket.push(entry);
    else groups.set(letter, [entry]);
  }
  return [...groups.entries()];
}

/**
 * Glossary: an alphabetical definition list. The letter rail stays under the header; each letter is
 * a heading over ruled rows, the term in the margin and its definition beside it from 768px. Every
 * term keeps its anchor, so a « Voir aussi » link lands on the row it names.
 */
export default async function GlossaryPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale: AppLocale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Glossary");
  const common = await getTranslations("Common");
  const entries = listGlossary(locale);
  const groups = groupByLetter(entries);
  const selector = await getEntrySelectorData();

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
              { name: t("breadcrumb"), url: localeUrl(locale, "/glossary") }
            ]}
          />
        }
      />

      <nav className="am-glossary-index" aria-label={t("indexLabel")}>
        <div className="am-container">
          <ul className="am-glossary-index__list">
            {groups.map(([letter]) => (
              <li key={letter}>
                <a className="am-glossary-index__link" href={`#lettre-${letter}`}>
                  {letter}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <Section>
        <p className="am-faq-meta">{t("termCount", { count: entries.length })}</p>
        {groups.map(([letter, letterEntries]) => (
          <section className="am-glossary-group" key={letter} id={`lettre-${letter}`} aria-labelledby={`lettre-${letter}-titre`}>
            <h2 className="am-glossary-group__letter" id={`lettre-${letter}-titre`}>
              {letter}
            </h2>
            <dl className="am-glossary-list">
              {letterEntries.map((entry) => (
                <div className="am-glossary-entry" key={entry.term} id={termId(entry.term)}>
                  <dt className="am-glossary-entry__term">{entry.term}</dt>
                  <dd className="am-glossary-entry__definition">{entry.definition}</dd>
                  {entry.seeAlso && entry.seeAlso.length > 0 ? (
                    <dd className="am-glossary-entry__see">
                      {t("seeAlso")} :{" "}
                      {entry.seeAlso.map((related, index) => (
                        <span key={related}>
                          {index > 0 ? ", " : null}
                          <a href={`#${termId(related)}`}>{related}</a>
                        </span>
                      ))}
                    </dd>
                  ) : null}
                </div>
              ))}
            </dl>
          </section>
        ))}
      </Section>

      {selector.countries.length > 0 ? (
        <Section tone="muted" title={common("compareOffers")} lead={t("selectorLead")} width="narrow" className="am-inst-compare">
          <EntrySelector countries={selector.countries} products={selector.products} defaultCountry={selector.defaultCountry} />
        </Section>
      ) : null}
    </>
  );
}
