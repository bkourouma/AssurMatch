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

/**
 * Sticky comparison bar of the offers list. The checkboxes are rendered by the server cards and
 * attached to the comparison form through `form=`, so this boundary only counts what is ticked and
 * shows the bar from two selections; the form itself still submits without JavaScript.
 *
 * It reads the `Common` namespace, which the locale layout ships to the browser.
 */
export function OfferComparisonBar({ formId }: OfferComparisonBarProps) {
  const t = useTranslations("Common");
  const [count, setCount] = useState(0);

  useEffect(() => {
    // Same contract as `Reveal`: the attribute marks the document as enhanced, which lets the page
    // hide the plain submit button it renders for browsers without JavaScript.
    document.documentElement.dataset["js"] = "true";

    function update() {
      setCount(document.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked').length);
    }
    update();
    document.addEventListener("change", update);
    return () => document.removeEventListener("change", update);
  }, []);

  return (
    <ComparisonBar
      count={count}
      label={t("comparisonBar.label")}
      countLabel={t("comparisonBar.count", { count })}
      action={
        // No disabled state here: the bar only appears from two selections, and a selection larger
        // than four is answered by the comparator page with the reason rather than by a dead button.
        <Button type="submit" form={formId} icon={<Icon name="scale" size={18} />}>
          {t("comparisonBar.action")}
        </Button>
      }
    />
  );
}
