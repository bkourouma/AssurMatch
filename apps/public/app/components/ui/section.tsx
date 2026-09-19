import type { ReactNode } from "react";

export interface SectionProps {
  children: ReactNode;
  title?: string;
  lead?: string;
  tone?: "default" | "muted" | "brand";
  id?: string;
  ariaLabel?: string;
  /** Rendered as an h2 by default; pass 1 on a page whose only heading is this section. */
  headingLevel?: 1 | 2 | 3;
}

export function Section({ children, title, lead, tone = "default", id, ariaLabel, headingLevel = 2 }: SectionProps) {
  const Heading = headingLevel === 1 ? "h1" : headingLevel === 3 ? "h3" : "h2";
  return (
    <section className="am-section" data-tone={tone === "default" ? undefined : tone} id={id} aria-label={ariaLabel}>
      <div className="am-container">
        {title || lead ? (
          <div className="am-section__header">
            {title ? <Heading>{title}</Heading> : null}
            {lead ? <p className="am-section__lead">{lead}</p> : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}
