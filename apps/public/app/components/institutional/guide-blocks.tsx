import type { ReactNode } from "react";
import { Card, CardBody, CardTitle } from "../ui/card";
import { Icon } from "../ui/icons";
import { Notice } from "../ui/notice";

/**
 * The three fixed blocks of a guide detail page (SPEC-050, content/03-guides-faq-lexique.md §A.2):
 * key points, mistakes to avoid, and the disclaimer stating what the guide does not replace. Each
 * reuses an existing design-system primitive rather than inventing a new visual language.
 */

export interface GuideKeyPointsProps {
  title: string;
  items: readonly string[];
}

/** Neutral (never green: green is reserved for validation states), coloured with a check icon. */
export function GuideKeyPoints({ title, items }: GuideKeyPointsProps) {
  if (items.length === 0) return null;
  return (
    <Notice tone="info" icon="check-circle" title={title}>
      <ul className="am-bullets">
        {items.map((item) => (
          <li key={item}>
            <Icon name="check" size={18} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Notice>
  );
}

export interface GuideMistakesProps {
  title: string;
  items: readonly string[];
}

/** Light warning tone (amber), never the blocking-error red: these are not system errors. */
export function GuideMistakes({ title, items }: GuideMistakesProps) {
  if (items.length === 0) return null;
  return (
    <Notice tone="indicative" title={title}>
      <ul className="am-bullets">
        {items.map((item) => (
          <li key={item}>
            <Icon name="check" size={18} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Notice>
  );
}

export interface GuideDisclaimerProps {
  title: string;
  children: ReactNode;
}

/** Fixed wording, identical on every guide: not per-guide data, so it lives in the component, not `guides.ts`. */
export function GuideDisclaimer({ title, children }: GuideDisclaimerProps) {
  return (
    <Card tone="muted" className="am-guide-disclaimer">
      <CardTitle as="p">{title}</CardTitle>
      <CardBody>
        <p>{children}</p>
      </CardBody>
    </Card>
  );
}
