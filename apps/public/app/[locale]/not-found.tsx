import { getTranslations } from "next-intl/server";
import { Link } from "../../i18n/navigation";
import { BackendText } from "../components/ui/backend-text";
import { Button } from "../components/ui/button";
import { listCountryDirectory } from "../lib/public-api";

/** Localised 404 inside the site chrome: it offers the open countries and the comparator. */
export default async function LocaleNotFound() {
  const t = await getTranslations("NotFound");
  const directory = await listCountryDirectory();
  const open = directory.data.filter((country) => country.availability === "open").slice(0, 8);

  return (
    <div className="am-container pub-page pub-main">
      <section className="pub-section">
        <h1>{t("title")}</h1>
        <p className="pub-lead">{t("description")}</p>
        <div className="pub-actions">
          <Button href="/compare">{t("cta")}</Button>
          <Button href="/" variant="secondary">
            {t("backHome")}
          </Button>
        </div>
      </section>

      {open.length > 0 ? (
        <section className="pub-section" aria-label={t("countriesTitle")}>
          <h2>{t("countriesTitle")}</h2>
          <ul className="pub-list">
            {open.map((country) => (
              <li key={country.isoCode}>
                <Link href={{ pathname: "/countries/[countryCode]", params: { countryCode: country.isoCode } }}>
                  <BackendText>{country.name}</BackendText>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
