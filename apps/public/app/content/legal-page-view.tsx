import type { ReactNode } from "react";
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
  /** Uppercase line above the title, e.g. "Informations légales". */
  kicker: string;
  /** Already interpolated, e.g. "Dernière mise à jour : 19/09/2026". */
  lastUpdatedLabel: string;
  /** Heading of the in-page table of contents, e.g. "Sommaire". */
  tocTitle: string;
  placeholdersTitle: string;
  placeholderNotice: string;
  countryNotice?: LegalPageCountryNotice;
}

/**
 * Shared renderer for the four legal pages and their four per-country variants: a compact hero, a
 * reading column (760px) with a table of contents when the page has more than one section, then a
 * visibly separated "à compléter" notice when the page carries placeholders.
 *
 * Kept under `app/content` (not `app/components`) because it is tied to the `LegalPage` shape this
 * folder owns, not a general-purpose UI primitive.
 */
export function LegalPageView({
  breadcrumbLabel,
  breadcrumbItems,
  page,
  kicker,
  lastUpdatedLabel,
  tocTitle,
  placeholdersTitle,
  placeholderNotice,
  countryNotice
}: LegalPageViewProps) {
  return (
    <>
      <Hero
        size="sm"
        kicker={kicker}
        title={page.title}
        lead={page.description}
        breadcrumb={<Breadcrumb label={breadcrumbLabel} items={breadcrumbItems} />}
      />

      <Section width="narrow">
        <p className="am-legal-meta">
          <Icon name="calendar" size={16} />
          {lastUpdatedLabel}
        </p>

        {countryNotice ? (
          <Notice tone="info" role="note">
            <p>{countryNotice.text}</p>
            {countryNotice.action ? <div className="am-legal-notice__action">{countryNotice.action}</div> : null}
          </Notice>
        ) : null}

        {page.sections.length > 1 ? (
          <nav className="am-legal-toc" aria-label={tocTitle}>
            <p className="am-legal-toc__title">
              <Icon name="list" size={16} />
              {tocTitle}
            </p>
            <ol className="am-legal-toc__list">
              {page.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.heading}</a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div className="am-legal-body">
          {page.sections.map((section) => (
            <section className="am-legal-section" key={section.id} id={section.id}>
              <h2>{section.heading}</h2>
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
            </section>
          ))}
        </div>
      </Section>

      {page.placeholders && page.placeholders.length > 0 ? (
        <Section tone="muted" width="narrow" title={placeholdersTitle} id="a-completer" spacing="compact">
          <Notice tone="indicative" role="note">
            <ul className="am-legal-placeholders">
              {page.placeholders.map((label) => (
                <li key={label}>
                  <LegalPlaceholder label={label} notice={placeholderNotice} />
                </li>
              ))}
            </ul>
          </Notice>
        </Section>
      ) : null}
    </>
  );
}
