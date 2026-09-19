"use client";

import { useParams } from "next/navigation";
import { useTransition } from "react";
import { usePathname, useRouter } from "../../../i18n/navigation";
import type { AppLocale } from "../../../i18n/routing";

export interface LanguageSwitcherProps {
  currentLocale: AppLocale;
  label: string;
  /** Display name per locale, e.g. { fr: "Francais", en: "English" }. */
  names: Record<AppLocale, string>;
}

type SwitchHref = { pathname: string; params?: Record<string, string | string[]>; query?: Record<string, string> };

/**
 * Switches locale on the localised equivalent of the current URL: the route params are carried over
 * and the query string is preserved, so filters and tokens survive the switch.
 */
export function LanguageSwitcher({ currentLocale, label, names }: LanguageSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [isPending, startTransition] = useTransition();

  // The typed router narrows params per route; the current route's params are reused as they are.
  const replace = router.replace as unknown as (href: SwitchHref, options: { locale: AppLocale }) => void;

  function switchTo(locale: AppLocale) {
    // Read on click rather than through useSearchParams, so the header never forces a page out of
    // static rendering.
    const query = typeof window === "undefined" ? {} : Object.fromEntries(new URLSearchParams(window.location.search).entries());
    startTransition(() => {
      replace({ pathname, params: params as Record<string, string | string[]>, query }, { locale });
    });
  }

  const locales = Object.keys(names) as AppLocale[];

  return (
    <div className="am-cluster" role="group" aria-label={label}>
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          className="am-button"
          data-variant={locale === currentLocale ? "secondary" : "tertiary"}
          lang={locale}
          aria-current={locale === currentLocale ? "true" : undefined}
          disabled={isPending || locale === currentLocale}
          onClick={() => switchTo(locale)}
        >
          <span>{names[locale]}</span>
        </button>
      ))}
    </div>
  );
}
