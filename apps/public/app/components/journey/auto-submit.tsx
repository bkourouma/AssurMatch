"use client";

import { useEffect } from "react";

export interface AutoSubmitProps {
  /** Id of the GET form whose changes resubmit the page. */
  formId: string;
}

/**
 * Submits a GET form as soon as one of its controls changes.
 *
 * The form it enhances is a plain `<form method="get">` with its own submit button, so switching
 * JavaScript off costs a click and nothing else. The button carries `am-j-nojs` and disappears once
 * any client boundary has marked the document as enhanced.
 */
export function AutoSubmit({ formId }: AutoSubmitProps) {
  useEffect(() => {
    document.documentElement.dataset["js"] = "true";
    const element = document.getElementById(formId);
    if (!(element instanceof HTMLFormElement)) return;
    const form: HTMLFormElement = element;

    const submit = () => form.requestSubmit();
    form.addEventListener("change", submit);
    return () => form.removeEventListener("change", submit);
  }, [formId]);

  return null;
}
