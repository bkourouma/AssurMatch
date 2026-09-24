import type { ReactNode } from "react";

export type HeroTone = "light" | "brand" | "navy";

export interface HeroProps {
  title: string;
  kicker?: string;
  lead?: string;
  /** Row of buttons under the lead. */
  actions?: ReactNode;
  /** Anything that belongs in the text column, under the actions (entry form, notice, pills). */
  children?: ReactNode;
  /** Second column on wide screens: an entry card, a preview, an illustration. */
  aside?: ReactNode;
  tone?: HeroTone;
  size?: "sm" | "md" | "lg";
  /** Breadcrumb rendered inside the hero, above the kicker. */
  breadcrumb?: ReactNode;
  className?: string;
}

/**
 * Page opening band. Never a green background: `light` is the brand gradient over the canvas,
 * `brand` a denser blue, `navy` the dark institutional variant (partner pages).
 */
export function Hero({
  title,
  kicker,
  lead,
  actions,
  children,
  aside,
  tone = "light",
  size = "md",
  breadcrumb,
  className
}: HeroProps) {
  return (
    <section
      className={className ? `am-hero ${className}` : "am-hero"}
      data-tone={tone === "light" ? undefined : tone}
      data-size={size === "md" ? undefined : size}
    >
      <div className="am-container">
        {breadcrumb ? <div className="am-hero__breadcrumb">{breadcrumb}</div> : null}
        <div className="am-hero__layout" data-columns={aside ? "2" : "1"}>
          <div className="am-hero__inner">
            {kicker ? <p className="am-hero__kicker">{kicker}</p> : null}
            <h1 className="am-hero__title">{title}</h1>
            {lead ? <p className="am-hero__lead">{lead}</p> : null}
            {actions ? <div className="am-hero__actions am-cluster">{actions}</div> : null}
            {children}
          </div>
          {aside ? <div className="am-hero__aside">{aside}</div> : null}
        </div>
      </div>
    </section>
  );
}
