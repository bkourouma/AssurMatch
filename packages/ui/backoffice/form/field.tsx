import type { ReactNode } from "react";
import { Icon } from "../icons";

export interface FieldProps {
  /** Id of the control rendered inside; label, hint and error are wired to it. */
  id: string;
  label: string;
  children: ReactNode;
  /**
   * Optional props accept an explicit `undefined` as well as being absent: under the repository's
   * `exactOptionalPropertyTypes`, a form naturally holds `errors[name]` as `string | undefined` and
   * passing that directly would otherwise be a type error at every single call site.
   */
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  requiredLabel?: string | undefined;
  /** Label beside the control instead of above it, for dense settings screens. */
  inline?: boolean | undefined;
  /**
   * Word announced and shown before the error (e.g. "Erreur") so the error is not carried by colour alone.
   * Without it the error markup is unchanged.
   */
  errorPrefix?: string | undefined;
  /**
   * Use when a `FormErrorSummary` already announces the errors: the field error then becomes a polite
   * live region instead of `role="alert"`, so it is not read twice.
   */
  liveError?: boolean | undefined;
}

/** Label always before the control, hint under it, error in danger-600 and announced. */
export function Field({ id, label, children, hint, error, required, requiredLabel, inline, errorPrefix, liveError }: FieldProps) {
  return (
    <div className={inline ? "bo-field bo-field--inline" : "bo-field"}>
      <label className="bo-field__label" htmlFor={id}>
        {label}
        {required ? (
          <span className="bo-field__required" aria-hidden="true">
            {" *"}
          </span>
        ) : null}
        {required && requiredLabel ? <span className="bo-visually-hidden">{` (${requiredLabel})`}</span> : null}
      </label>
      {children}
      {hint ? (
        <p className="bo-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          className="bo-field__error"
          id={`${id}-error`}
          role={liveError ? undefined : "alert"}
          aria-live={liveError ? "polite" : undefined}
        >
          {errorPrefix ? (
            <>
              <Icon name="alert" size={16} />
              <span className="bo-visually-hidden">{`${errorPrefix} : `}</span>
            </>
          ) : null}
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Ids and classes a control must carry so that the hint and the error are announced. */
export function fieldControlProps(
  id: string,
  options: {
    hint?: string | undefined;
    error?: string | undefined;
    required?: boolean | undefined;
    /** Extra ids appended to `aria-describedby` (a character counter, a section hint...). */
    describedBy?: string | undefined;
    /** Marks the control invalid without an inline error (the message lives elsewhere, e.g. a summary). */
    invalid?: boolean | undefined;
  } = {}
) {
  const describedBy = [options.hint ? `${id}-hint` : null, options.error ? `${id}-error` : null, options.describedBy || null]
    .filter(Boolean)
    .join(" ");
  return {
    id,
    className: "bo-field__control",
    ...(options.required ? { required: true, "aria-required": true as const } : {}),
    ...(options.error || options.invalid ? { "aria-invalid": true as const } : {}),
    ...(describedBy ? { "aria-describedby": describedBy } : {})
  };
}
