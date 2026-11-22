"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./broker-ui";

export interface LeadSubmitButtonProps {
  children: ReactNode;
  /** Label while the request is on its way; the button is disabled so a double click sends once. */
  pendingLabel: string;
  variant?: "primary" | "secondary" | undefined;
}

/**
 * Submit button of a server-rendered form (server action or classic POST) that shows « en cours »
 * and ignores a second click. It only wraps the button: the form, its fields, its action and its
 * redirect stay exactly as the page renders them, and without JavaScript the form still submits.
 *
 * The state is set one tick after the click on purpose: disabling a submit button inside its own
 * click handler would cancel the submission it is about to start.
 */
export function LeadSubmitButton({ children, pendingLabel, variant = "primary" }: LeadSubmitButtonProps) {
  const [pending, setPending] = useState(false);

  // Coming back to the page from the history cache must not leave the button stuck.
  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  return (
    <Button
      type="submit"
      variant={variant}
      pending={pending}
      pendingLabel={pendingLabel}
      onClick={(event) => {
        // A form the browser refuses (empty required field) does not start a request: stay clickable.
        const form = event.currentTarget.form;
        if (form && !form.checkValidity()) return;
        window.setTimeout(() => setPending(true), 0);
      }}
    >
      {children}
    </Button>
  );
}
