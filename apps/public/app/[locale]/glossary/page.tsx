import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale, type AppLocale } from "../../../i18n/routing";
import { EntrySelector } from "../../components/site/entry-selector";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Section } from "../../components/ui/section";
import { getEntrySelectorData } from "../../content/entry-selector-data";
import { listGlossary } from "../../content/glossary";
import type { GlossaryEntry } from "../../content/types";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";

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
      <div className="am-container">
        <Breadcrumb
          label={common("breadcrumbLabel")}
          items={[
            { name: common("home"), url: localeUrl(locale, "/") },
            { name: t("breadcrumb"), url: localeUrl(locale, "/glossary") }
          ]}
        />
      </div>

      <Section headingLevel={1} title={t("title")} lead={t("lead")}>
        <nav aria-label={t("title")} className="am-cluster">
          {groups.map(([letter]) => (
            <a key={letter} href={`#lettre-${letter}`}>
              {letter}
            </a>
          ))}
        </nav>
      </Section>

      {groups.map(([letter, letterEntries]) => (
        <Section key={letter} title={letter} id={`lettre-${letter}`}>
          <dl className="pub-criteria">
            {letterEntries.map((entry) => (
              <div key={entry.term}>
                <dt id={termId(entry.term)}>{entry.term}</dt>
                <dd>
                  <p>{entry.definition}</p>
                  {entry.seeAlso && entry.seeAlso.length > 0 ? (
                    <p className="pub-meta">
                      {t("seeAlso")} :{" "}
                      {entry.seeAlso.map((related, index) => (
                        <span key={related}>
                          {index > 0 ? ", " : null}
                          <a href={`#${termId(related)}`}>{related}</a>
                        </span>
                      ))}
                    </p>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      ))}

      {selector.countries.length > 0 ? (
        <Section title={common("compareOffers")} tone="brand">
          <EntrySelector countries={selector.countries} products={selector.products} defaultCountry={selector.defaultCountry} />
        </Section>
      ) : null}
    </>
  );
}
