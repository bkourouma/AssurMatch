import type { ElementType, ReactNode } from "react";

export type CardTone = "surface" | "muted" | "brand" | "navy" | "outline" | "dashed";

export interface CardProps {
  children: ReactNode;
  /** Rendered element: `li` inside a list, `article` for an editorial card. Defaults to `div`. */
  as?: ElementType;
  tone?: CardTone;
  /** Hover elevation and border tint; use it when the whole card leads somewhere. */
  interactive?: boolean;
  /** Extra elevation, for the one panel that must float (entry form, recommended plan). */
  raised?: boolean;
  /** Ring of primary-500 around the card: the recommended plan, the selected offer. */
  featured?: boolean;
  padding?: "sm" | "md" | "lg";
  className?: string;
  id?: string;
}

const TONE_CLASS: Record<CardTone, string> = {
  surface: "",
  muted: " am-card--muted",
  brand: " am-card--brand",
  navy: " am-card--navy",
  outline: " am-card--outline",
  dashed: " am-card--dashed"
};

/** The one container of the design system: a white surface, a 1px border and a soft shadow. */
export function Card({
  children,
  as,
  tone = "surface",
  interactive,
  raised,
  featured,
  padding = "md",
  className,
  id
}: CardProps) {
  const Tag = (as ?? "div") as ElementType;
  const classes = [
    "am-card",
    TONE_CLASS[tone].trim(),
    interactive ? "am-card--interactive" : "",
    raised ? "am-card--raised" : "",
    featured ? "am-card--featured" : "",
    padding === "sm" ? "am-card--pad-sm" : padding === "lg" ? "am-card--pad-lg" : "",
    className ?? ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={classes} id={id}>
      {children}
    </Tag>
  );
}

export interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return <div className={className ? `am-card__header ${className}` : "am-card__header"}>{children}</div>;
}

export interface CardTitleProps {
  children: ReactNode;
  /** Rendered as an h3 by default: a card almost always sits under a section heading. */
  as?: "h2" | "h3" | "h4" | "p";
  className?: string;
  id?: string;
}

export function CardTitle({ children, as = "h3", className, id }: CardTitleProps) {
  const Tag = as;
  return (
    <Tag className={className ? `am-card__title ${className}` : "am-card__title"} id={id}>
      {children}
    </Tag>
  );
}

export interface CardBodyProps {
  children: ReactNode;
  className?: string;
}

export function CardBody({ children, className }: CardBodyProps) {
  return <div className={className ? `am-card__body ${className}` : "am-card__body"}>{children}</div>;
}

export interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

export function CardFooter({ children, className }: CardFooterProps) {
  return <div className={className ? `am-card__footer ${className}` : "am-card__footer"}>{children}</div>;
}

export interface CardMetaProps {
  children: ReactNode;
  className?: string;
}

/** One line of secondary information (date, reading time, country). */
export function CardMeta({ children, className }: CardMetaProps) {
  return <p className={className ? `am-card__meta ${className}` : "am-card__meta"}>{children}</p>;
}
