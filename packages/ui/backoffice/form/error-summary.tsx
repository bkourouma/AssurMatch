"use client";

import { useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { Icon } from "../icons";

export interface FormErrorSummaryItem {
  /** Id of the control in error: the link targets `#id`. */
  id: string;
  message: string;
}

export interface FormErrorSummaryProps {
  title: string;
  errors: FormErrorSummaryItem[];
  className?: string | undefined;
}

/** Moves the focus to the offending control instead of only jumping to the hash. */
function focusField(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  target.focus();
  target.scrollIntoView({ block: "center" });
}

/**
 * Error summary placed above a form: takes the focus when errors appear and links each message to
 * its field. Pair it with `Field liveError` so the field errors are not announced a second time.
 */
export function FormErrorSummary({ title, errors, className }: FormErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const signature = errors.map((error) => `${error.id}:${error.message}`).join("|");

  useEffect(() => {
    if (signature) ref.current?.focus();
  }, [signature]);

  if (errors.length === 0) return null;

  return (
    <div className={className ? `bo-error-summary ${className}` : "bo-error-summary"} role="alert" tabIndex={-1} ref={ref}>
      <p className="bo-error-summary__title">
        <Icon name="alert" size={20} />
        <span>{title}</span>
      </p>
      <ul className="bo-error-summary__list">
        {errors.map((error) => (
          <li key={error.id}>
            <a href={`#${error.id}`} onClick={(event) => focusField(event, error.id)}>
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
