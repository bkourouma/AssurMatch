import { useTranslations } from "next-intl";
import { Button } from "../ui/button";

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
}

/**
 * Country then product entry point. It is a plain GET form targeting /aller, which resolves the pair
 * server-side and redirects to the localised product page, so it works without JavaScript.
 */
export function EntrySelector({ countries, products, defaultCountry }: EntrySelectorProps) {
  const t = useTranslations("Layout.entrySelector");
  if (countries.length === 0) return null;

  return (
    <form className="am-entry" method="get" action="/aller" aria-label={t("label")}>
      <div className="am-entry__row">
        <div className="am-field">
          <label className="am-field__label" htmlFor="am-entry-country">
            {t("country")}
          </label>
          <select className="am-field__control" id="am-entry-country" name="pays" defaultValue={defaultCountry ?? ""} required>
            {countries.map((country) => (
              <option key={country.isoCode} value={country.isoCode}>
                {country.name}
              </option>
            ))}
          </select>
        </div>
        <div className="am-field">
          <label className="am-field__label" htmlFor="am-entry-product">
            {t("product")}
          </label>
          <select className="am-field__control" id="am-entry-product" name="produit" required>
            {products.map((product) => (
              <option key={`${product.countryIso ?? ""}-${product.key}`} value={product.key}>
                {product.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit">{t("submit")}</Button>
      </div>
      <p className="am-field__hint">{t("hint")}</p>
    </form>
  );
}
