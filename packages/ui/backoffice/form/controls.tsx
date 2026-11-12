import type { ComponentProps, ReactNode } from "react";

/**
 * Adds the control class, but never twice: the props returned by `fieldControlProps` already carry
 * it, and spreading them into `Input`/`Select`/`Textarea` is the normal call site.
 */
function control(className?: string | undefined): string {
  if (!className) return "bo-field__control";
  return className.split(/\s+/).includes("bo-field__control") ? className : `bo-field__control ${className}`;
}

export type InputProps = ComponentProps<"input">;

export function Input({ className, ...rest }: InputProps) {
  return <input className={control(className)} {...rest} />;
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean | undefined;
}

export interface SelectProps extends Omit<ComponentProps<"select">, "children"> {
  options?: SelectOption[] | undefined;
  /**
   * Rendered as a disabled first entry with an empty value, selected until the user chooses. A `required`
   * select that carries no value, no `defaultValue` and no empty option gets "Choisir…" automatically, so that
   * the browser blocks the submission instead of silently sending the first option.
   */
  placeholder?: string | undefined;
  children?: ReactNode;
}

export const SELECT_DEFAULT_PLACEHOLDER = "Choisir…";

/** Pure decision behind `Select`: which placeholder is shown, whether it is hidden, and the uncontrolled default value. */
export function resolveSelectPlaceholder(input: {
  placeholder?: string | undefined;
  required?: boolean | undefined;
  multiple?: boolean | undefined;
  size?: number | undefined;
  value?: unknown;
  defaultValue?: unknown;
  hasEmptyOption: boolean;
}): { label: string | undefined; hidden: boolean; defaultValue: "" | undefined } {
  const uncontrolled = input.value === undefined && input.defaultValue === undefined;
  const single = !input.multiple && (input.size === undefined || input.size <= 1);
  const auto = input.required === true && uncontrolled && single && !input.hasEmptyOption;
  const label = input.placeholder ?? (auto ? SELECT_DEFAULT_PLACEHOLDER : undefined);
  return {
    label,
    // A required select hides its placeholder from the list (a choice is mandatory); a filter keeps it visible.
    hidden: label !== undefined && input.required === true,
    defaultValue: label !== undefined && uncontrolled ? "" : undefined
  };
}

export function Select({ options, placeholder, children, className, ...rest }: SelectProps) {
  // Children may carry their own empty option (e.g. "Aucune"): never add a second placeholder then.
  const hasEmptyOption = options?.some((option) => option.value === "") === true || children !== undefined;
  const resolved = resolveSelectPlaceholder({
    placeholder,
    required: rest.required,
    multiple: rest.multiple,
    size: rest.size,
    value: rest.value,
    defaultValue: rest.defaultValue,
    hasEmptyOption
  });
  return (
    <select className={control(className)} {...rest} {...(resolved.defaultValue !== undefined ? { defaultValue: resolved.defaultValue } : {})}>
      {resolved.label ? (
        <option value="" disabled hidden={resolved.hidden}>
          {resolved.label}
        </option>
      ) : null}
      {options?.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
      {children}
    </select>
  );
}

export type TextareaProps = ComponentProps<"textarea">;

export function Textarea({ className, ...rest }: TextareaProps) {
  return <textarea className={control(className)} {...rest} />;
}

export interface CheckboxProps extends Omit<ComponentProps<"input">, "type"> {
  label: ReactNode;
  hint?: string | undefined;
}

export function Checkbox({ label, hint, className, id, ...rest }: CheckboxProps) {
  const hintId = hint && id ? `${id}-hint` : undefined;
  return (
    <label className={className ? `bo-check ${className}` : "bo-check"} htmlFor={id}>
      <input type="checkbox" id={id} aria-describedby={hintId} {...rest} />
      <span className="bo-check__text">
        <span>{label}</span>
        {hint ? (
          <span className="bo-check__hint" id={hintId}>
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export interface ChoiceOption {
  value: string;
  label: string;
  hint?: string | undefined;
  disabled?: boolean | undefined;
}

export interface CheckboxGroupProps {
  legend: string;
  name: string;
  options: ChoiceOption[];
  defaultValues?: string[] | undefined;
  columns?: 1 | 2 | undefined;
  describedBy?: string | undefined;
}

export function CheckboxGroup({ legend, name, options, defaultValues, columns = 2, describedBy }: CheckboxGroupProps) {
  const selected = new Set(defaultValues ?? []);
  return (
    <fieldset className="bo-fieldset" aria-describedby={describedBy}>
      <legend>{legend}</legend>
      <div className={columns === 1 ? "bo-check-group bo-check-group--single" : "bo-check-group"}>
        {options.map((option) => (
          <label className="bo-check" key={option.value}>
            <input
              type="checkbox"
              name={name}
              value={option.value}
              defaultChecked={selected.has(option.value)}
              disabled={option.disabled}
            />
            <span className="bo-check__text">
              <span>{option.label}</span>
              {option.hint ? <span className="bo-check__hint">{option.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export interface RadioGroupProps {
  legend: string;
  name: string;
  options: ChoiceOption[];
  defaultValue?: string | undefined;
  columns?: 1 | 2 | undefined;
  describedBy?: string | undefined;
}

export function RadioGroup({ legend, name, options, defaultValue, columns = 2, describedBy }: RadioGroupProps) {
  return (
    <fieldset className="bo-fieldset" aria-describedby={describedBy}>
      <legend>{legend}</legend>
      <div className={columns === 1 ? "bo-check-group bo-check-group--single" : "bo-check-group"}>
        {options.map((option) => (
          <label className="bo-check" key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={defaultValue === option.value}
              disabled={option.disabled}
            />
            <span className="bo-check__text">
              <span>{option.label}</span>
              {option.hint ? <span className="bo-check__hint">{option.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export interface InputGroupProps {
  children: ReactNode;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export function InputGroup({ children, prefix, suffix }: InputGroupProps) {
  return (
    <span className="bo-input-group">
      {prefix ? <span className="bo-input-group__prefix">{prefix}</span> : null}
      {children}
      {suffix ? <span className="bo-input-group__suffix">{suffix}</span> : null}
    </span>
  );
}
