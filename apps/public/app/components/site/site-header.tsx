import { getTranslations } from "next-intl/server";
import { Button } from "../ui/button";
import { LanguageSwitcher } from "../ui/language-switcher";
import { Logo } from "../ui/logo";
import { Link } from "../../../i18n/navigation";
import type { AppLocale } from "../../../i18n/routing";
import { readVisitorCountry } from "../../lib/visitor-country";
import { CountrySelector } from "./country-selector";
import { HeaderScrollShadow } from "./header-scroll-shadow";
import { MobileMenu, type MobileMenuEntry } from "./mobile-menu";

const HEADER_ID = "am-site-header";

/**
 * 64px header: logo, main navigation, compact country selector, the comparator call to action which
 * stays visible on mobile, the language switcher and the no-JavaScript mobile menu.
 */
export async function SiteHeader({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("Layout");
  const visitor = await readVisitorCountry();
  // SITE-102: the selector shows the same pre-selection the pages announce. Without a cookie or a
  // geo header there is nothing to detect, so it falls back to the first open country rather than
  // showing an empty control while the page says a country is pre-selected.
  const selectedCountry = visitor.isoCode ?? visitor.directory.find((entry) => entry.availability === "open")?.isoCode;

  const entries: MobileMenuEntry[] = [
    { href: "/how-it-works", label: t("nav.howItWorks") },
    { href: "/countries", label: t("nav.countries") },
    { href: "/guides", label: t("nav.guides") },
    { href: "/brokers", label: t("nav.brokers") }
  ];

  const languageNames: Record<AppLocale, string> = { fr: t("languageSwitcher.fr"), en: t("languageSwitcher.en") };

  return (
    <header className="am-header" id={HEADER_ID} data-scrolled="false">
      <div className="am-container am-header__inner">
        <Link className="am-header__brand" href="/" aria-label={t("homeLink")}>
          <Logo height={32} priority />
        </Link>

        <nav className="am-header__nav" aria-label={t("navLabel")}>
          {entries.map((entry) => (
            <Link className="am-header__link" href={entry.href} key={entry.label}>
              {entry.label}
            </Link>
          ))}
        </nav>

        <div className="am-header__actions">
          <div className="am-header__desktop-only">
            <CountrySelector countries={visitor.directory} variant="compact" selected={selectedCountry} />
          </div>
          <Button href="/compare" className="am-header__cta">
            {t("cta")}
          </Button>
          <div className="am-header__desktop-only">
            <LanguageSwitcher currentLocale={locale} label={t("languageSwitcher.label")} names={languageNames} />
          </div>
          <MobileMenu
            className="am-header__menu"
            openLabel={t("menu.open")}
            closeLabel={t("menu.close")}
            navLabel={t("menu.label")}
            entries={entries}
          >
            <CountrySelector countries={visitor.directory} variant="compact" selected={selectedCountry} />
            <LanguageSwitcher currentLocale={locale} label={t("languageSwitcher.label")} names={languageNames} />
          </MobileMenu>
        </div>
      </div>
      <HeaderScrollShadow targetId={HEADER_ID} />
    </header>
  );
}
