import type { ComponentProps, ReactNode } from "react";
import { Link } from "../../../i18n/navigation";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "whatsapp";

type LinkHref = ComponentProps<typeof Link>["href"];

export interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  /** Internal route (typed href of the i18n Link) or an absolute external URL. */
  href?: LinkHref;
  externalHref?: string;
  type?: "button" | "submit" | "reset";
  icon?: ReactNode;
  iconAfter?: ReactNode;
  fullWidth?: boolean;
  disabled?: boolean;
  name?: string;
  value?: string;
  form?: string;
  title?: string;
  rel?: string;
  target?: string;
  "aria-label"?: string;
  className?: string;
}

/**
 * The single call to action of the public site. It renders an anchor when a destination is given and
 * a button otherwise, and never uses green as a primary colour (green stays a validation signal).
 */
export function Button(props: ButtonProps) {
  const {
    children,
    variant = "primary",
    href,
    externalHref,
    type = "button",
    icon,
    iconAfter,
    fullWidth,
    disabled,
    className,
    ...rest
  } = props;

  const classes = className ? `am-button ${className}` : "am-button";
  const body = (
    <>
      {icon}
      <span>{children}</span>
      {iconAfter}
    </>
  );

  if (externalHref) {
    return (
      <a
        className={classes}
        data-variant={variant}
        data-full={fullWidth ? "true" : undefined}
        href={externalHref}
        rel={rest.rel ?? (rest.target === "_blank" ? "noreferrer noopener" : undefined)}
        target={rest.target}
        title={rest.title}
        aria-label={rest["aria-label"]}
      >
        {body}
      </a>
    );
  }

  if (href) {
    return (
      <Link
        className={classes}
        data-variant={variant}
        data-full={fullWidth ? "true" : undefined}
        href={href}
        title={rest.title}
        aria-label={rest["aria-label"]}
      >
        {body}
      </Link>
    );
  }

  return (
    <button
      className={classes}
      data-variant={variant}
      data-full={fullWidth ? "true" : undefined}
      type={type}
      disabled={disabled}
      name={rest.name}
      value={rest.value}
      form={rest.form}
      title={rest.title}
      aria-label={rest["aria-label"]}
    >
      {body}
    </button>
  );
}
