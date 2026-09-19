import { getTranslations } from "next-intl/server";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Link } from "../../../i18n/navigation";
import type { CountryAvailability, PublicCountryDirectoryItem } from "../../lib/public-api";
import { setVisitorCountry } from "../../lib/visitor-country-actions";

export interface CountrySelectorProps {
  countries: readonly PublicCountryDirectoryItem[];
  /** `compact` is the header form; `extended` is the card grid of the countries page. */
  variant?: "compact" | "extended";
  selected?: string | null | undefined;
}

const availabilityTone: Record<CountryAvailability, "new" | "pilot" | "soon"> = {
  open: "new",
  pilot: "pilot",
  waitlist: "soon"
};

/**
 * Compact: a plain form posting the `setVisitorCountry` server action, so changing country works
 * without JavaScript. Extended: the card grid, with the availability of each country.
 */
export async function CountrySelector({ countries, variant = "compact", selected }: CountrySelectorProps) {
  const t = await getTranslations("Layout.countrySelector");
  if (countries.length === 0) return null;

  if (variant === "compact") {
    return (
      <form className="am-countryselect" action={setVisitorCountry}>
        <label className="am-countryselect__label" htmlFor="am-country-select">
          {t("label")}
        </label>
        <select id="am-country-select" name="countryIso" defaultValue={selected ?? ""} aria-label={t("placeholder")}>
          <option value="" disabled>
            {t("placeholder")}
          </option>
          {countries.map((country) => (
            <option key={country.isoCode} value={country.isoCode}>
              {country.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          {t("submit")}
        </Button>
      </form>
    );
  }

  return (
    <ul className="am-countrygrid" aria-label={t("extendedLabel")}>
      {countries.map((country) => (
        <li className="am-countrycard" key={country.isoCode}>
          <h3>
            <Link href={{ pathname: "/countries/[countryCode]", params: { countryCode: country.isoCode } }}>{country.name}</Link>
          </h3>
          <p>
            <Badge tone={availabilityTone[country.availability]}>{t(`availability.${country.availability}`)}</Badge>
          </p>
        </li>
      ))}
    </ul>
  );
}
