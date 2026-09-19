import type { ReactNode } from "react";
import { Breadcrumb, type BreadcrumbEntry } from "../components/ui/breadcrumb";
import { Notice } from "../components/ui/notice";
import { Section } from "../components/ui/section";
import { LegalPlaceholder } from "./legal-placeholder";
import type { LegalPage } from "./types";

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
  placeholdersTitle: string;
  placeholderNotice: string;
  countryNotice?: LegalPageCountryNotice;
}

/**
 * Shared renderer for the four legal pages and their four per-country variants: one `h1` (the page
 * title), then one `Section` per `ContentSection`, then a visibly separated "à compléter" notice when
 * the page carries placeholders. Kept under `app/content` (not `app/components`) because it is tied
 * to the `LegalPage` shape this folder owns, not a general-purpose UI primitive.
 */
export function LegalPageView({ breadcrumbLabel, breadcrumbItems, page, lastUpdatedLabel, placeholdersTitle, placeholderNotice, countryNotice }: LegalPageViewProps) {
  return (
    <>
      <div className="am-container">
        <Breadcrumb label={breadcrumbLabel} items={breadcrumbItems} />
      </div>

      <Section headingLevel={1} title={page.title} lead={page.description}>
        <p className="pub-meta">{lastUpdatedLabel}</p>
        {countryNotice ? (
          <Notice tone="info" role="note">
            <p>{countryNotice.text}</p>
            {countryNotice.action}
          </Notice>
        ) : null}
      </Section>

      {page.sections.map((section) => (
        <Section key={section.id} id={section.id} title={section.heading}>
          {section.body.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          {section.bullets ? (
            <ul className="pub-list">
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
        </Section>
      ))}

      {page.placeholders && page.placeholders.length > 0 ? (
        <Section title={placeholdersTitle} tone="muted" id="a-completer">
          <Notice tone="indicative" role="note">
            <ul className="pub-list">
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
