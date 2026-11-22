"use client";

import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";

export interface FilterBarProps {
  /** Path the GET form submits to, e.g. "/users". */
  action: string;
  method?: "get" | undefined;
  children: ReactNode;
  /** Accessible name of the filter region; the surface owns the wording. */
  label: string;
  submitLabel: string;
  resetLabel?: string | undefined;
  /** Destination of the reset link, usually the bare pathname. */
  resetHref?: string | undefined;
  /** Number of filters currently applied; shows a chip when above zero. */
  activeCount?: number | undefined;
  /** Submits as soon as a select or a checkbox changes (text inputs keep the explicit button). */
  autoSubmit?: boolean | undefined;
  /** Hidden text read after the count chip, e.g. "filtres actifs"; the surface owns the wording. */
  activeCountLabel?: string | undefined;
}

/**
 * Progressive enhancement only: without JavaScript the submit button still applies the filters, and
 * the whole state stays in the query string so a filtered view remains a shareable link.
 */
export function FilterBar({
  action,
  method = "get",
  children,
  label,
  submitLabel,
  resetLabel,
  resetHref,
  activeCount = 0,
  autoSubmit = false,
  activeCountLabel
}: FilterBarProps) {
  // The button is disabled once the form is on its way, so a double click cannot send it twice.
  // Without JavaScript nothing changes: the native submit still works.
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Coming back through the history cache restores the page as it was left: re-enable the button.
    const restore = () => setSubmitting(false);
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);

  function handleChange(event: FormEvent<HTMLFormElement>) {
    if (!autoSubmit) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const tag = target.tagName.toLowerCase();
    const type = (target as HTMLInputElement).type;
    const isToggle = tag === "input" && (type === "checkbox" || type === "radio" || type === "date");
    if (tag !== "select" && !isToggle) return;
    event.currentTarget.requestSubmit();
  }

  return (
    <form className="bo-filters" action={action} method={method} role="search" aria-label={label} onChange={handleChange} onSubmit={() => setSubmitting(true)}>
      {children}
      <div className="bo-filters__actions">
        <button className="bo-button" data-variant="secondary" data-size="sm" type="submit" disabled={submitting ? true : undefined}>
          {submitLabel}
        </button>
        {resetLabel && resetHref ? (
          <a className="bo-button" data-variant="tertiary" data-size="sm" href={resetHref}>
            {resetLabel}
          </a>
        ) : null}
        {activeCount > 0 ? (
          <span className="bo-filters__count" role="status">
            {activeCount}
            {activeCountLabel ? <span className="bo-visually-hidden">{` ${activeCountLabel}`}</span> : null}
          </span>
        ) : null}
      </div>
    </form>
  );
}
