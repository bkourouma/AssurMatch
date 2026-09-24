import { getTranslations } from "next-intl/server";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Icon } from "../ui/icons";
import { Link } from "../../../i18n/navigation";
import type { CountryAvailability, PublicCountryDirectoryItem } from "../../lib/public-api";
import { setVisitorCountry } from "../../lib/visitor-country-actions";

export interface CountrySelectorProps {
  countries: readonly PublicCountryDirectoryItem[];
  /** `compact` is the header form; `extended` is the card grid of the countries page. */
  variant?: "compact" | "extended";
  selected?: string | null | undefined;
  /**
   * Icon-only submit button and no visible label: the header's `am-header__utilities` row has no room
   * for the full "Changer de pays" wording next to the language switcher and the CTA. The mobile menu
   * panel keeps the full text since it has the whole width of the screen.
   */
  dense?: boolean;
  /** Two compact instances (header row, mobile menu panel) render at once; each needs its own id. */
  idPrefix?: string;
}

const availabilityTone: Record<CountryAvailability, "new" | "pilot" | "soon"> = {
  open: "new",
  pilot: "pilot",
  waitlist: "soon"
};

/** Flag of an ISO 3166-1 alpha-2 code, drawn by the font from the two regional indicator letters. */
function flagEmoji(isoCode: string): string | null {
  const code = isoCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return String.fromCodePoint(...Array.from(code, (letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

/**
 * Compact: one pill control - globe, the native `<select>` blended into the pill, and the submit as a
 * quiet icon button. It is a plain form posting the `setVisitorCountry` server action, so changing
 * country works without JavaScript and the button is always visible rather than revealed by script.
 * Extended: the card grid of the countries page, each card entirely clickable.
 */
export async function CountrySelector({ countries, variant = "compact", selected, dense = false, idPrefix = "am-country-select" }: CountrySelectorProps) {
  const t = await getTranslations("Layout.countrySelector");
  if (countries.length === 0) return null;

  if (variant === "compact") {
    return (
      <form className="am-countryselect" action={setVisitorCountry} data-dense={dense ? "true" : undefined}>
        <label className="am-countryselect__label" htmlFor={idPrefix}>
          {t("label")}
        </label>
        <div className="am-countryselect__control">
          <Icon name="globe" size={18} className="am-countryselect__globe" />
          <select
            className="am-countryselect__select"
            id={idPrefix}
            name="countryIso"
            defaultValue={selected ?? ""}
            aria-label={t("placeholder")}
          >
            <option value="" disabled>
              {t("placeholder")}
            </option>
            {countries.map((country) => (
              <option key={country.isoCode} value={country.isoCode}>
                {country.name}
              </option>
            ))}
          </select>
          <Icon name="chevron-down" size={16} className="am-countryselect__chevron" />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="am-countryselect__submit"
            icon={<Icon name="arrow-right" size={16} />}
            {...(dense ? { iconOnly: true, "aria-label": t("submit") } : {})}
          >
            {t("submit")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <ul className="am-countrygrid" aria-label={t("extendedLabel")}>
      {countries.map((country) => {
        const flag = flagEmoji(country.isoCode);
        return (
          <li className="am-countrycard am-countrycard--link" key={country.isoCode}>
            {flag ? (
              <span className="am-countrycard__flag" aria-hidden="true">
                {flag}
              </span>
            ) : null}
            <h3 className="am-countrycard__name">
              <Link className="am-countrycard__link" href={{ pathname: "/countries/[countryCode]", params: { countryCode: country.isoCode } }}>
                {country.name}
              </Link>
            </h3>
            <p className="am-countrycard__meta">
              <Badge tone={availabilityTone[country.availability]}>{t(`availability.${country.availability}`)}</Badge>
              <Icon name="arrow-right" size={18} className="am-countrycard__arrow" />
            </p>
          </li>
        );
      })}
    </ul>
  );
}
