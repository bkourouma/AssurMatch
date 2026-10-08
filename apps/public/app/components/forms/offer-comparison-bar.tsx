"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { ComparisonBar } from "../ui/comparison-bar";
import { Icon } from "../ui/icons";

export interface OfferComparisonBarProps {
  /** Id of the GET form the offer checkboxes are attached to. */
  formId: string;
}

/** Id of the shared, visually-hidden explanation a capped checkbox is described by (D-Comparaison). */
export const OFFER_CAP_HINT_ID = "am-compare-cap-hint";

const MAX_SELECTION = 4;

/** Every checkbox of the offers list, wherever the update runs from. */
function offerCheckboxes(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('input[name="ids"]')];
}

/**
 * Sticky comparison bar of the offers list. The checkboxes are rendered by the server cards and
 * attached to the comparison form through `form=`, so this boundary only counts what is ticked and
 * shows the bar from two selections; the form itself still submits without JavaScript.
 *
 * It also enforces the 4-offer cap in the interface (FR-012, D-Comparaison): once 4 boxes are
 * ticked, every other, unchecked box is disabled with a shared explanation, so a fifth selection is
 * impossible rather than merely rejected on the compare page. Without JavaScript this enhancement
 * never runs and the compare page's own validation (2 to 4 ids) stays the fallback.
 *
 * It reads the `Common` and `Offers` namespaces, which the locale layout ships to the browser.
 */
export function OfferComparisonBar({ formId }: OfferComparisonBarProps) {
  const t = useTranslations("Common");
  const tOffers = useTranslations("Offers");
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Same contract as `Reveal`: the attribute marks the document as enhanced, which lets the page
    // hide the plain submit button it renders for browsers without JavaScript.
    document.documentElement.dataset["js"] = "true";

    function update() {
      const boxes = offerCheckboxes();
      const checked = boxes.filter((box) => box.checked).length;
      setCount(checked);
      for (const box of boxes) {
        if (box.checked) {
          box.disabled = false;
          box.removeAttribute("aria-describedby");
          continue;
        }
        if (checked >= MAX_SELECTION) {
          box.disabled = true;
          box.setAttribute("aria-describedby", OFFER_CAP_HINT_ID);
        } else {
          box.disabled = false;
          box.removeAttribute("aria-describedby");
        }
      }
    }
    update();
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, []);

  return (
    <ComparisonBar
      count={count}
      label={t("comparisonBar.label")}
      countLabel={count >= MAX_SELECTION ? tOffers("compareBarMax") : t("comparisonBar.count", { count })}
      action={
        <Button type="submit" form={formId} icon={<Icon name="scale" size={18} />}>
          {tOffers("compareSubmit")}
        </Button>
      }
    />
  );
}

/**
 * Assistive text shown near the results count while exactly one offer is selected (D-Comparaison):
 * the floating bar itself only appears from two selections, so a lone tick would otherwise give no
 * feedback at all. `aria-live="polite"` announces it without moving focus.
 */
export function SelectionAssist() {
  const t = useTranslations("Offers");
  const [count, setCount] = useState(0);

  useEffect(() => {
    function update() {
      setCount(offerCheckboxes().filter((box) => box.checked).length);
    }
    update();
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, []);

  if (count !== 1) return null;
  return (
    <p className="am-j-selection-assist" role="status" aria-live="polite">
      {t("selectionAssist")}
    </p>
  );
}
