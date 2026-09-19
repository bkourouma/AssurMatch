"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ComparisonBar } from "../ui/comparison-bar";

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
        <button className="am-button" data-variant="primary" type="submit" form={formId}>
          <span>{t("comparisonBar.action")}</span>
        </button>
      }
    />
  );
}
