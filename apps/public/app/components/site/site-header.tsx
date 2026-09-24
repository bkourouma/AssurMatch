import { getTranslations } from "next-intl/server";
import { Button } from "../ui/button";
import { Icon } from "../ui/icons";
import { LanguageSwitcher } from "../ui/language-switcher";
import { Logo } from "../ui/logo";
import { Link } from "../../../i18n/navigation";
import type { AppLocale } from "../../../i18n/routing";
import { readVisitorCountry } from "../../lib/visitor-country";
import { CountrySelector } from "./country-selector";
import { HeaderScrollShadow } from "./header-scroll-shadow";
import { MobileMenu, type MobileMenuEntry } from "./mobile-menu";
import { NavLink } from "./nav-link";

const HEADER_ID = "am-site-header";
const MENU_ID = "am-site-menu";

/**
 * Sticky 72px header: logo | centred navigation | utilities and the comparator call to action, which
 * stays visible at every viewport (icon-only under 480px, with its label repeated in the menu). Once
 * the page is scrolled the bar turns into frosted glass - a `data-scrolled` attribute set by the one
 * small client component below; everything else here is server-rendered.
 */
export async function SiteHeader({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("Layout");
  const visitor = await readVisitorCountry();
  // SITE-102: the selector shows the same pre-selection the pages announce. Without a cookie or a
  // geo header there is nothing to detect, so it falls back to the first open country rather than
  // showing an empty control while the page says a country is pre-selected.
  const selectedCountry = visitor.isoCode ?? visitor.directory.find((entry) => entry.availability === "open")?.isoCode;

  const entries: MobileMenuEntry[] = [
    { href: "/how-it-works", label: t("nav.howItWorks"), icon: "compass" },
    { href: "/countries", label: t("nav.countries"), icon: "globe" },
    { href: "/guides", label: t("nav.guides"), icon: "book-open" },
    { href: "/brokers", label: t("nav.brokers"), icon: "briefcase" }
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
            <NavLink className="am-header__link" href={entry.href} key={entry.label}>
              {entry.label}
            </NavLink>
          ))}
        </nav>

        <div className="am-header__actions">
          <div className="am-header__utilities">
            <CountrySelector countries={visitor.directory} variant="compact" selected={selectedCountry} dense idPrefix="am-country-select-header" />
            <LanguageSwitcher currentLocale={locale} label={t("languageSwitcher.label")} names={languageNames} />
          </div>
          <Button href="/compare" className="am-header__cta" icon={<Icon name="search" size={18} />} aria-label={t("cta")}>
            {t("cta")}
          </Button>
          <MobileMenu
            id={MENU_ID}
            className="am-header__menu"
            openLabel={t("menu.open")}
            closeLabel={t("menu.close")}
            navLabel={t("menu.label")}
            homeLabel={t("homeLink")}
            ctaLabel={t("cta")}
            brokerSpaceLabel={t("menu.brokerSpace")}
            entries={entries}
          >
            <CountrySelector countries={visitor.directory} variant="compact" selected={selectedCountry} idPrefix="am-country-select-menu" />
            <LanguageSwitcher currentLocale={locale} label={t("languageSwitcher.label")} names={languageNames} />
          </MobileMenu>
        </div>
      </div>
      <HeaderScrollShadow targetId={HEADER_ID} menuId={MENU_ID} />
    </header>
  );
}
