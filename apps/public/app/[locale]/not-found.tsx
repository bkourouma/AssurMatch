import { getTranslations } from "next-intl/server";
import { Link } from "../../i18n/navigation";
import { BackendText } from "../components/ui/backend-text";
import { Button } from "../components/ui/button";
import { Icon } from "../components/ui/icons";
import { IconTile } from "../components/ui/icon-tile";
import { listCountryDirectory } from "../lib/public-api";
import "../styles/pages/institutional.css";

/** Localised 404 inside the site chrome: it offers the open countries and the comparator. */
export default async function LocaleNotFound() {
  const t = await getTranslations("NotFound");
  const directory = await listCountryDirectory();
  const open = directory.data.filter((country) => country.availability === "open").slice(0, 8);

  return (
    <section className="am-section">
      <div className="am-container">
        <div className="am-errorpage">
          <span className="am-errorpage__icon">
            <IconTile name="compass" size="lg" />
          </span>
          <h1 className="am-errorpage__title">{t("title")}</h1>
          <p className="am-errorpage__lead">{t("description")}</p>
          <div className="am-errorpage__actions">
            <Button href="/compare" icon={<Icon name="search" size={20} />}>
              {t("cta")}
            </Button>
            <Button href="/" variant="secondary" icon={<Icon name="home" size={20} />}>
              {t("backHome")}
            </Button>
          </div>

          {open.length > 0 ? (
            <>
              <h2 className="am-eyebrow" id="pays-ouverts">
                {t("countriesTitle")}
              </h2>
              <ul className="am-errorpage-countries" aria-labelledby="pays-ouverts">
                {open.map((country) => (
                  <li key={country.isoCode}>
                    <Link href={{ pathname: "/countries/[countryCode]", params: { countryCode: country.isoCode } }}>
                      <BackendText>{country.name}</BackendText>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
