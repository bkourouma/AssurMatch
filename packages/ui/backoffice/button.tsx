import { useId } from "react";
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
  /**
   * Why the button is disabled. Only used while `disabled`: it becomes the `title` and a visually hidden
   * text referenced by `aria-describedby`, so keyboard and screen reader users get the reason too.
   */
  disabledReason?: string | undefined;
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
    disabledReason,
    onClick
  } = props;

  const reasonId = useId();
  const isDisabled = disabled || pending;
  const reason = disabled && disabledReason ? disabledReason : undefined;
  const describedBy = reason ? reasonId : undefined;
  const classes = className ? `bo-button ${className}` : "bo-button";
  const label = pending && pendingLabel !== undefined ? pendingLabel : children;
  const body = (
    <>
      {pending ? null : icon}
      {/* The live region only exists while pending, so the default DOM is unchanged. */}
      <span aria-live={pending && pendingLabel !== undefined ? "polite" : undefined}>{label}</span>
      {iconAfter}
      {reason ? (
        <span className="bo-visually-hidden" id={reasonId}>
          {reason}
        </span>
      ) : null}
    </>
  );

  if (href) {
    // A disabled link has no `href` (so no navigation, no keyboard activation) and leaves the tab order.
    return (
      <a
        className={classes}
        data-variant={variant}
        data-size={size}
        data-full={fullWidth ? "true" : undefined}
        data-reason={reason ? "true" : undefined}
        href={disabled ? undefined : href}
        target={target}
        rel={rel ?? (target === "_blank" ? "noreferrer noopener" : undefined)}
        title={reason ?? title}
        aria-label={props["aria-label"]}
        aria-describedby={describedBy}
        aria-disabled={disabled ? true : undefined}
        role={disabled ? "link" : undefined}
        tabIndex={disabled ? -1 : undefined}
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
      data-reason={reason ? "true" : undefined}
      type={type}
      disabled={isDisabled}
      aria-busy={pending ? true : undefined}
      name={name}
      value={value}
      form={form}
      formAction={formAction}
      title={reason ?? title}
      aria-label={props["aria-label"]}
      aria-describedby={describedBy}
      onClick={onClick}
    >
      {body}
    </button>
  );
}
