import type { ReactNode } from "react";

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
}

/** Label always before the control, hint under it, error in danger-600 and announced. */
export function Field({ id, label, children, hint, error, required, requiredLabel, inline }: FieldProps) {
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
        <p className="bo-field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Ids and classes a control must carry so that the hint and the error are announced. */
export function fieldControlProps(
  id: string,
  options: { hint?: string | undefined; error?: string | undefined; required?: boolean | undefined } = {}
) {
  const describedBy = [options.hint ? `${id}-hint` : null, options.error ? `${id}-error` : null].filter(Boolean).join(" ");
  return {
    id,
    className: "bo-field__control",
    ...(options.required ? { required: true } : {}),
    ...(options.error ? { "aria-invalid": true as const } : {}),
    ...(describedBy ? { "aria-describedby": describedBy } : {})
  };
}
