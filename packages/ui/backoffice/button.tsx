import type { MouseEventHandler, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  type?: "button" | "submit" | "reset" | undefined;
  /** When given the button renders as an anchor: navigation, never a submit. */
  href?: string | undefined;
  target?: string | undefined;
  rel?: string | undefined;
  pending?: boolean | undefined;
  /** Label swapped in while `pending` is true, e.g. "Enregistrement...". */
  pendingLabel?: ReactNode | undefined;
  disabled?: boolean | undefined;
  icon?: ReactNode;
  iconAfter?: ReactNode;
  fullWidth?: boolean | undefined;
  name?: string | undefined;
  value?: string | undefined;
  form?: string | undefined;
  formAction?: string | ((formData: FormData) => void | Promise<void>) | undefined;
  className?: string | undefined;
  title?: string | undefined;
  "aria-label"?: string | undefined;
  /** Usable from a client component; the component itself stays server-safe. */
  onClick?: MouseEventHandler<HTMLButtonElement> | undefined;
}

/**
 * The single back-office call to action. Green is never a variant here: validation green stays a
 * status colour, so a confirm button is `primary` and a destructive one is `danger`.
 */
export function Button(props: ButtonProps) {
  const {
    children,
    variant = "primary",
    size = "md",
    type = "button",
    href,
    target,
    rel,
    pending = false,
    pendingLabel,
    disabled = false,
    icon,
    iconAfter,
    fullWidth,
    name,
    value,
    form,
    formAction,
    className,
    title,
    onClick
  } = props;

  const classes = className ? `bo-button ${className}` : "bo-button";
  const label = pending && pendingLabel !== undefined ? pendingLabel : children;
  const body = (
    <>
      {pending ? null : icon}
      <span>{label}</span>
      {iconAfter}
    </>
  );

  if (href) {
    return (
      <a
        className={classes}
        data-variant={variant}
        data-size={size}
        data-full={fullWidth ? "true" : undefined}
        href={href}
        target={target}
        rel={rel ?? (target === "_blank" ? "noreferrer noopener" : undefined)}
        title={title}
        aria-label={props["aria-label"]}
        aria-disabled={disabled ? true : undefined}
      >
        {body}
      </a>
    );
  }

  return (
    <button
      className={classes}
      data-variant={variant}
      data-size={size}
      data-full={fullWidth ? "true" : undefined}
      data-pending={pending ? "true" : undefined}
      type={type}
      disabled={disabled || pending}
      aria-busy={pending ? true : undefined}
      name={name}
      value={value}
      form={form}
      formAction={formAction}
      title={title}
      aria-label={props["aria-label"]}
      onClick={onClick}
    >
      {body}
    </button>
  );
}
