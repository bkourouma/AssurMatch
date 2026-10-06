import type { ReactNode } from "react";
import { ArticleToc } from "../components/institutional/article-toc";
import { Breadcrumb, type BreadcrumbEntry } from "../components/ui/breadcrumb";
import { Hero } from "../components/ui/hero";
import { Icon } from "../components/ui/icons";
import { Notice } from "../components/ui/notice";
import { Section } from "../components/ui/section";
import { LegalPlaceholder } from "./legal-placeholder";
import type { LegalPage } from "./types";
import "../styles/pages/institutional.css";

export interface LegalPageCountryNotice {
  text: string;
  /** A pre-built Button/Link back to the global version of this page, rendered by the caller. */
  action?: ReactNode;
}

export interface LegalPageViewProps {
  breadcrumbLabel: string;
  breadcrumbItems: readonly BreadcrumbEntry[];
  page: LegalPage;
  /** Already interpolated, e.g. "Dernière mise à jour : 19/09/2026". */
  lastUpdatedLabel: string;
  /** Heading of the in-page table of contents, e.g. "Sommaire". */
  tocTitle: string;
  /** Title of the "L'essentiel en 5 lignes" list, shown only when `page.summary` is present. */
  summaryTitle: string;
  placeholdersTitle: string;
  placeholderNotice: string;
  countryNotice?: LegalPageCountryNotice;
}

/**
 * Shared renderer for the four legal pages and their four per-country variants: a small sign with
 * the last-updated line, then the article column (about 68 characters) with the short summary, the
 * table of contents in a rail from 1024px, and the sections. The facts the repository does not hold
 * yet stay visible on their own band, each one marked « à compléter », never left out.
 *
 * Kept under `app/content` (not `app/components`) because it is tied to the `LegalPage` shape this
 * folder owns, not a general-purpose UI primitive. Presentation only: the legal text is never edited
 * here.
 */
export function LegalPageView({
  breadcrumbLabel,
  breadcrumbItems,
  page,
  lastUpdatedLabel,
  tocTitle,
  summaryTitle,
  placeholdersTitle,
  placeholderNotice,
  countryNotice
}: LegalPageViewProps) {
  const hasToc = page.sections.length > 1;

  return (
    <>
      <Hero size="sm" title={page.title} lead={page.description} breadcrumb={<Breadcrumb label={breadcrumbLabel} items={breadcrumbItems} />}>
        <p className="am-signmeta">
          <span>
            <Icon name="calendar" size={18} />
            {lastUpdatedLabel}
          </span>
        </p>
      </Hero>

      <Section>
        <div className="am-article" data-toc={hasToc ? "true" : undefined}>
          {countryNotice ? (
            <Notice tone="info" role="note">
              <p>{countryNotice.text}</p>
              {countryNotice.action ? <div className="am-legal-notice__action">{countryNotice.action}</div> : null}
            </Notice>
          ) : null}

          {page.summary && page.summary.length > 0 ? (
            <section className="am-article__points">
              <h2 className="am-ruled-title">{summaryTitle}</h2>
              <ul className="am-ruled" data-mark="dot">
                {page.summary.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <ArticleToc title={tocTitle} entries={page.sections} />

          <div className="am-article__body">
            {page.sections.map((section) => (
              <section className="am-article__section" key={section.id} id={section.id}>
                <h2>{section.heading}</h2>
                {section.body.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
                {section.bullets ? (
                  <ul>
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </Section>

      {page.placeholders && page.placeholders.length > 0 ? (
        <Section tone="muted" title={placeholdersTitle} id="a-completer" spacing="compact">
          <ul className="am-legal-placeholders">
            {page.placeholders.map((label) => (
              <li key={label}>
                <LegalPlaceholder label={label} notice={placeholderNotice} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
