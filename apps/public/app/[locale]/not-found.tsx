import { getTranslations } from "next-intl/server";
import { Link } from "../../i18n/navigation";
import { BackendText } from "../components/ui/backend-text";
import { Button } from "../components/ui/button";
import { Hero } from "../components/ui/hero";
import { Icon } from "../components/ui/icons";
import { IconTile } from "../components/ui/icon-tile";
import { Section } from "../components/ui/section";
import { listCountryDirectory } from "../lib/public-api";
import "../styles/pages/institutional.css";

/** Localised 404 inside the site chrome: it offers the open countries and the comparator. */
export default async function LocaleNotFound() {
  const t = await getTranslations("NotFound");
  const directory = await listCountryDirectory();
  const open = directory.data.filter((country) => country.availability === "open").slice(0, 8);

  return (
    <>
      <Hero
        className="am-hero--spotlight am-errorhero"
        kicker={t("kicker")}
        title={t.rich("heroTitle", { accent: (chunks) => <span className="am-hero__accent">{chunks}</span> })}
        lead={t("description")}
        actions={
          <>
            <Button href="/compare" icon={<Icon name="search" size={20} />}>
              {t("cta")}
            </Button>
            <Button href="/" variant="secondary" icon={<Icon name="home" size={20} />}>
              {t("backHome")}
            </Button>
          </>
        }
        aside={
          <div className="am-errorhero__art" aria-hidden="true">
            <span className="am-errorhero__num">404</span>
            <IconTile className="am-inst-icon" name="compass" size="lg" />
          </div>
        }
      />

      {open.length > 0 ? (
        <Section tone="muted" spacing="compact">
          <div className="am-errorpage">
            <h2 className="am-eyebrow" id="pays-ouverts">
              {t("countriesTitle")}
            </h2>
            <ul className="am-errorpage-countries" aria-labelledby="pays-ouverts">
              {open.map((country) => (
                <li key={country.isoCode}>
                  <Link href={{ pathname: "/countries/[countryCode]", params: { countryCode: country.isoCode } }}>
                    <BackendText>{country.name}</BackendText>
                    <Icon name="arrow-right" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      ) : null}
    </>
  );
}
