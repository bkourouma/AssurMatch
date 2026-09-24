import type { ComponentProps, ReactNode } from "react";

export interface FormProps extends Omit<ComponentProps<"form">, "className"> {
  children: ReactNode;
  /** Two columns above 760px; a `FormRow full` then spans both. */
  columns?: 1 | 2 | undefined;
  className?: string | undefined;
}

export function Form({ children, columns = 1, className, ...rest }: FormProps) {
  const base = columns === 2 ? "bo-form bo-form--two" : "bo-form";
  return (
    <form className={className ? `${base} ${className}` : base} {...rest}>
      {children}
    </form>
  );
}

export interface FormSectionProps {
  legend: string;
  description?: string | undefined;
  children: ReactNode;
}

export function FormSection({ legend, description, children }: FormSectionProps) {
  return (
    <fieldset className="bo-fieldset">
      <legend>{legend}</legend>
      {description ? <p className="bo-fieldset__description">{description}</p> : null}
      {children}
    </fieldset>
  );
}

export interface FormActionsProps {
  children: ReactNode;
  align?: "end" | "start" | "between" | undefined;
}

export function FormActions({ children, align = "end" }: FormActionsProps) {
  return (
    <div className="bo-form__actions" data-align={align === "end" ? undefined : align}>
      {children}
    </div>
  );
}

export interface FormRowProps {
  children: ReactNode;
  /** Spans both columns of a two-column form. */
  full?: boolean | undefined;
  className?: string | undefined;
}

export function FormRow({ children, full, className }: FormRowProps) {
  const base = full ? "bo-form__full" : "";
  const classes = [base, className].filter(Boolean).join(" ");
  return <div className={classes || undefined}>{children}</div>;
}
