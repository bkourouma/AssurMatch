import type { ReactNode } from "react";
import { Icon } from "../ui/icons";

/**
 * The fixed blocks of a guide detail page (SPEC-050, content/03-guides-faq-lexique.md §A.2): key
 * points, mistakes to avoid, and the note stating what the guide does not replace. They are ruled
 * lists in the article column, headed by a 2px navy rule, the grammar every reading page shares.
 */

export interface GuideKeyPointsProps {
  title: string;
  items: readonly string[];
}

/** Navy ticks, never green: green is kept for what a broker has confirmed. */
export function GuideKeyPoints({ title, items }: GuideKeyPointsProps) {
  if (items.length === 0) return null;
  return (
    <section className="am-article__points">
      <h2 className="am-ruled-title">{title}</h2>
      <ul className="am-ruled" data-mark="tick">
        {items.map((item) => (
          <li key={item}>
            <Icon name="check" size={20} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface GuideMistakesProps {
  title: string;
  items: readonly string[];
}

/** A neutral minus: these are habits to drop, not system errors, so never the error red. */
export function GuideMistakes({ title, items }: GuideMistakesProps) {
  if (items.length === 0) return null;
  return (
    <section className="am-article__mistakes">
      <h2 className="am-ruled-title">{title}</h2>
      <ul className="am-ruled" data-mark="minus">
        {items.map((item) => (
          <li key={item}>
            <Icon name="minus" size={20} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface GuideDisclaimerProps {
  title: string;
  children: ReactNode;
}

/** Fixed wording, identical on every guide: not per-guide data, so it lives in the component, not `guides.ts`. */
export function GuideDisclaimer({ title, children }: GuideDisclaimerProps) {
  return (
    <aside className="am-article__note">
      <p className="am-article__note-title">{title}</p>
      <p>{children}</p>
    </aside>
  );
}
