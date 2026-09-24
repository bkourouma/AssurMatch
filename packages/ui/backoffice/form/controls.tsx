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
  /** Rendered as a disabled first entry with an empty value. */
  placeholder?: string | undefined;
  children?: ReactNode;
}

export function Select({ options, placeholder, children, className, ...rest }: SelectProps) {
  return (
    <select className={control(className)} {...rest}>
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
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
