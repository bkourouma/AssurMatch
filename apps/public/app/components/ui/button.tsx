import type { ComponentProps, ReactNode } from "react";
import { Link } from "../../../i18n/navigation";
import { Icon } from "./icons";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "ghost" | "whatsapp";
export type ButtonSize = "sm" | "md" | "lg";

type LinkHref = ComponentProps<typeof Link>["href"];

export interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Internal route (typed href of the i18n Link) or an absolute external URL. */
  href?: LinkHref;
  externalHref?: string;
  type?: "button" | "submit" | "reset";
  icon?: ReactNode;
  iconAfter?: ReactNode;
  fullWidth?: boolean;
  disabled?: boolean;
  /** Square button; `children` stays as the accessible name and is hidden visually. */
  iconOnly?: boolean;
  /** Swaps the leading icon for a spinner and blocks the click. */
  loading?: boolean;
  /**
   * Only honoured on the `<button>` rendering (no `href`/`externalHref`): a link navigates, it does
   * not run a handler. Lets a client form use the primitive instead of hand-rolling `.am-button`.
   */
  onClick?: ComponentProps<"button">["onClick"];
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
    size = "md",
    href,
    externalHref,
    type = "button",
    icon,
    iconAfter,
    fullWidth,
    disabled,
    iconOnly,
    loading,
    onClick,
    className,
    ...rest
  } = props;

  const classes = className ? `am-button ${className}` : "am-button";
  const flags = {
    "data-variant": variant,
    ...(size !== "md" ? { "data-size": size } : {}),
    ...(fullWidth ? { "data-full": "true" as const } : {}),
    ...(iconOnly ? { "data-icon-only": "true" as const } : {}),
    ...(loading ? { "data-loading": "true" as const } : {})
  };

  const leading = loading ? (
    <span className="am-button__spinner">
      <Icon name="loader" size={size === "sm" ? 16 : 20} />
    </span>
  ) : (
    icon
  );

  const body = (
    <>
      {leading}
      <span className={iconOnly ? "am-visually-hidden" : undefined}>{children}</span>
      {iconAfter}
    </>
  );

  if (externalHref) {
    return (
      <a
        className={classes}
        {...flags}
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
      <Link className={classes} {...flags} href={href} title={rest.title} aria-label={rest["aria-label"]}>
        {body}
      </Link>
    );
  }

  return (
    <button
      className={classes}
      {...flags}
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
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
