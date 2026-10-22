"use client";

import { useEffect } from "react";

export interface OfferQuotePickerProps {
  /** Id of the GET form whose `offerId` checkboxes are capped. */
  formId: string;
  /** Id of the visible explanation a capped checkbox is described by. */
  hintId: string;
}

const MAX_QUOTE_OFFERS = 3;

/**
 * Progressive enhancement of the "request a quote for several offers" form of the comparison page.
 * Once 3 boxes are ticked, every other box is disabled and described by the cap hint, so a fourth
 * offer cannot be picked. Without JavaScript this never runs: the form still submits natively and
 * the quote page and the server enforce the same cap of 3. It renders nothing.
 */
export function OfferQuotePicker({ formId, hintId }: OfferQuotePickerProps) {
  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) return undefined;

    function update() {
      const boxes = [...form!.querySelectorAll<HTMLInputElement>('input[name="offerId"]')];
      const checked = boxes.filter((box) => box.checked).length;
      for (const box of boxes) {
        if (!box.checked && checked >= MAX_QUOTE_OFFERS) {
          box.disabled = true;
          box.setAttribute("aria-describedby", hintId);
        } else {
          box.disabled = false;
          box.removeAttribute("aria-describedby");
        }
      }
    }
    update();
    form.addEventListener("change", update);
    return () => form.removeEventListener("change", update);
  }, [formId, hintId]);

  return null;
}
