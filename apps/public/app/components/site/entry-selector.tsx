import { useTranslations } from "next-intl";
import { Button } from "../ui/button";
import { Field } from "../ui/field";
import { Icon } from "../ui/icons";

export interface EntrySelectorCountry {
  isoCode: string;
  name: string;
}

export interface EntrySelectorProduct {
  key: string;
  name: string;
  /** ISO code of the country the product belongs to, used to group the options. */
  countryIso?: string;
}

export interface EntrySelectorProps {
  countries: readonly EntrySelectorCountry[];
  products: readonly EntrySelectorProduct[];
  defaultCountry?: string | null;
  /** Optional heading rendered above the two selects, e.g. on the home page. */
  title?: string;
}

/**
 * Country then product entry point, and the primary action of the home page: an elevated white panel
 * carrying two selects and one button.
 *
 * It is still a plain GET form targeting /aller, which resolves the pair server-side and redirects to
 * the localised product page, so it works without JavaScript.
 */
export function EntrySelector({ countries, products, defaultCountry, title }: EntrySelectorProps) {
  const t = useTranslations("Layout.entrySelector");
  if (countries.length === 0) return null;

  return (
    <form className="am-entry" method="get" action="/aller" aria-label={t("label")}>
      {title ? <p className="am-entry__title">{title}</p> : null}
      <div className="am-entry__row">
        <Field id="am-entry-country" label={t("country")} leading="map-pin">
          <select className="am-field__control" id="am-entry-country" name="pays" defaultValue={defaultCountry ?? ""} required>
            {countries.map((country) => (
              <option key={country.isoCode} value={country.isoCode}>
                {country.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="am-entry-product" label={t("product")} leading="shield-check">
          <select className="am-field__control" id="am-entry-product" name="produit" required>
            {products.map((product) => (
              <option key={`${product.countryIso ?? ""}-${product.key}`} value={product.key}>
                {product.name}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" size="lg" fullWidth icon={<Icon name="search" size={20} />}>
          {t("submit")}
        </Button>
      </div>
      <p className="am-field__hint">{t("hint")}</p>
    </form>
  );
}
