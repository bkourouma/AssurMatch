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
}

/**
 * Label always above the control, hint below it, error in danger-600. The hint and the error ids are
 * always exposed through `aria-describedby` on the control rendered by `renderControl`.
 */
export function Field({ id, label, children, hint, error, required, requiredLabel }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="am-field">
      <label className="am-field__label" htmlFor={id}>
        {label}
        {required ? (
          <span className="am-field__required" aria-hidden="true">
            {" *"}
          </span>
        ) : null}
        {required && requiredLabel ? <span className="am-visually-hidden">{` (${requiredLabel})`}</span> : null}
      </label>
      {children}
      {hint ? (
        <p className="am-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="am-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Ids a control must carry so that the hint and the error are announced. */
export function fieldControlProps(id: string, options: { hint?: string | undefined; error?: string | undefined; required?: boolean | undefined }) {
  const describedBy = [options.hint ? `${id}-hint` : null, options.error ? `${id}-error` : null].filter(Boolean).join(" ");
  return {
    id,
    className: "am-field__control",
    ...(options.required ? { required: true } : {}),
    ...(options.error ? { "aria-invalid": true as const } : {}),
    ...(describedBy ? { "aria-describedby": describedBy } : {})
  };
}
