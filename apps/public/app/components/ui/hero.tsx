import type { ReactNode } from "react";

export type HeroTone = "light" | "brand" | "navy";

export interface HeroProps {
  title: string;
  /**
   * Kept for API compatibility and no longer rendered: the sign system has no eyebrow above a
   * heading. Where the kicker carried a status (« Offre indicative »), pass a Badge in `children`.
   */
  kicker?: string;
  lead?: string;
  /** Row of buttons under the lead. */
  actions?: ReactNode;
  /** Anything that belongs in the text column, under the actions (entry form, notice, pills). */
  children?: ReactNode;
  /** Second column on wide screens: an entry plate, an identity card. */
  aside?: ReactNode;
  /** Kept for API compatibility: every hero is indigo cloth with a pattern sheet. */
  tone?: HeroTone;
  size?: "sm" | "md" | "lg";
  /** The location line of the sign. */
  breadcrumb?: ReactNode;
  /**
   * « Vous êtes ici » route strip of the journey pages. When it is given, it takes the breadcrumb's
   * place: the breadcrumb is kept, inert, only for its structured data.
   */
  route?: ReactNode;
  className?: string;
}

/**
 * The page opening: every public page starts on indigo cloth. The location line (or the journey tape)
 * sits on the cloth; the title, one lead and what the page needs sit on a pale pattern sheet laid on
 * it. Children that are plates (cards, notices, the entry form) keep their light surface.
 */
export function Hero({ title, lead, actions, children, aside, size = "md", breadcrumb, route, className }: HeroProps) {
  return (
    <section className={className ? `am-hero ${className}` : "am-hero"} data-size={size === "md" ? undefined : size}>
      <div className="am-container">
        {route ? <div className="am-hero__routestrip">{route}</div> : null}
        {breadcrumb ? (
          route ? (
            // Out of the tab order and the accessibility tree: the strip above is the visible way
            // back; the trail stays in the DOM for its BreadcrumbList structured data.
            <div className="am-visually-hidden" inert>
              {breadcrumb}
            </div>
          ) : (
            <div className="am-hero__breadcrumb">{breadcrumb}</div>
          )
        ) : null}
        <div className="am-hero__sheet">
          <div className="am-hero__layout" data-columns={aside ? "2" : "1"}>
            <div className="am-hero__inner">
              <h1 className="am-hero__title">{title}</h1>
              {lead ? <p className="am-hero__lead">{lead}</p> : null}
              {actions ? <div className="am-hero__actions am-cluster">{actions}</div> : null}
              {children}
            </div>
            {aside ? <div className="am-hero__aside">{aside}</div> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
