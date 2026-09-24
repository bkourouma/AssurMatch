"use client";

import { useParams } from "next/navigation";
import { useTransition, type CSSProperties } from "react";
import { usePathname, useRouter } from "../../../i18n/navigation";
import type { AppLocale } from "../../../i18n/routing";

export interface LanguageSwitcherProps {
  currentLocale: AppLocale;
  label: string;
  /** Display name per locale, e.g. { fr: "Francais", en: "English" }. */
  names: Record<AppLocale, string>;
  /** `invert` is the navy footer version; the default sits on a light surface. */
  tone?: "default" | "invert";
}

type SwitchHref = { pathname: string; params?: Record<string, string | string[]>; query?: Record<string, string> };

/**
 * Segmented FR | EN pill: the active segment is a sliding indicator behind the labels, so switching
 * language reads as one control rather than two buttons.
 *
 * Switches locale on the localised equivalent of the current URL: the route params are carried over
 * and the query string is preserved, so filters and tokens survive the switch.
 */
export function LanguageSwitcher({ currentLocale, label, names, tone = "default" }: LanguageSwitcherProps) {
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
  const activeIndex = Math.max(0, locales.indexOf(currentLocale));
  const geometry = { "--am-langswitch-count": locales.length, "--am-langswitch-index": activeIndex } as CSSProperties;

  return (
    <div
      className="am-langswitch"
      role="group"
      aria-label={label}
      data-tone={tone === "invert" ? "invert" : undefined}
      data-pending={isPending ? "true" : undefined}
      style={geometry}
    >
      <span className="am-langswitch__indicator" aria-hidden="true" />
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          className="am-langswitch__option"
          lang={locale}
          title={names[locale]}
          aria-label={names[locale]}
          aria-current={locale === currentLocale ? "true" : undefined}
          disabled={isPending || locale === currentLocale}
          onClick={() => switchTo(locale)}
        >
          {locale.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
