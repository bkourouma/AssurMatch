import type { ReactNode } from "react";

export interface CardProps {
  children: ReactNode;
  /** Rendered as the `h2` of the card header. */
  title?: string | undefined;
  description?: string | undefined;
  actions?: ReactNode;
  footer?: ReactNode;
  plain?: boolean | undefined;
  muted?: boolean | undefined;
  as?: "section" | "article" | "div" | undefined;
  className?: string | undefined;
  "aria-label"?: string | undefined;
}

export function Card(props: CardProps) {
  const { children, title, description, actions, footer, plain, muted, as = "section", className } = props;
  const Tag = as;
  const classes = ["bo-card", plain ? "bo-card--plain" : null, muted ? "bo-card--muted" : null, className]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} aria-label={props["aria-label"]}>
      {title || description || actions ? (
        <div className="bo-card__header">
          <div className="bo-card__header-text">
            {title ? <h2 className="bo-section-title">{title}</h2> : null}
            {description ? <p className="bo-card__description">{description}</p> : null}
          </div>
          {actions ? <div className="bo-card__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="bo-card__body">{children}</div>
      {footer ? <div className="bo-card__footer">{footer}</div> : null}
    </Tag>
  );
}
