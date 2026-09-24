import type { ReactNode } from "react";

export type SectionTone = "default" | "muted" | "brand" | "navy" | "canvas";

export interface SectionProps {
  children: ReactNode;
  title?: string;
  lead?: string;
  /** Uppercase line above the title. */
  kicker?: string;
  /** Buttons or links under the lead, inside the header block. */
  actions?: ReactNode;
  tone?: SectionTone;
  id?: string;
  ariaLabel?: string;
  /** Rendered as an h2 by default; pass 1 on a page whose only heading is this section. */
  headingLevel?: 1 | 2 | 3;
  align?: "start" | "center";
  width?: "default" | "wide" | "narrow";
  spacing?: "default" | "compact";
  className?: string;
}

/** A band of the page: vertical rhythm, optional background tone and a header block. */
export function Section({
  children,
  title,
  lead,
  kicker,
  actions,
  tone = "default",
  id,
  ariaLabel,
  headingLevel = 2,
  align = "start",
  width = "default",
  spacing = "default",
  className
}: SectionProps) {
  const Heading = headingLevel === 1 ? "h1" : headingLevel === 3 ? "h3" : "h2";
  const container =
    width === "wide" ? "am-container am-container--wide" : width === "narrow" ? "am-container am-container--narrow" : "am-container";

  return (
    <section
      className={className ? `am-section ${className}` : "am-section"}
      data-tone={tone === "default" ? undefined : tone}
      data-spacing={spacing === "compact" ? "compact" : undefined}
      id={id}
      aria-label={ariaLabel}
    >
      <div className={container}>
        {title || lead || kicker || actions ? (
          <div className="am-section__header" data-align={align === "center" ? "center" : undefined}>
            {kicker ? <p className="am-section__kicker">{kicker}</p> : null}
            {title ? <Heading className="am-section__title">{title}</Heading> : null}
            {lead ? <p className="am-section__lead">{lead}</p> : null}
            {actions ? <div className="am-section__actions">{actions}</div> : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}
