import { getTranslations } from "next-intl/server";
import { BackendText } from "../components/ui/backend-text";
import { Directory, type DirectoryItem } from "../components/ui/directory";
import { Hero } from "../components/ui/hero";
import { Section } from "../components/ui/section";
import { listCountryDirectory } from "../lib/public-api";
import "../styles/pages/institutional.css";

/**
 * Localised 404 inside the site chrome: a sign that says the page is not there, the places a visitor
 * usually wants as directory rows on it, then the open countries, each one named by its ISO code.
 */
export default async function LocaleNotFound() {
  const t = await getTranslations("NotFound");
  const howItWorks = await getTranslations("HowItWorks");
  const guides = await getTranslations("Guides");
  const faq = await getTranslations("Faq");
  const contact = await getTranslations("Contact");
  const directory = await listCountryDirectory();
  const open = directory.data.filter((country) => country.availability === "open").slice(0, 8);

  const destinations: DirectoryItem[] = [
    { key: "compare", title: t("cta"), icon: "search", href: "/countries" },
    { key: "home", title: t("backHome"), icon: "home", href: "/" },
    { key: "how-it-works", title: howItWorks("title"), icon: "compass", href: "/how-it-works" },
    { key: "guides", title: guides("title"), icon: "book-open", href: "/guides" },
    { key: "faq", title: faq("title"), icon: "help-circle", href: "/faq" },
    { key: "contact", title: contact("title"), icon: "mail", href: "/contact" }
  ];

  const countryRows: DirectoryItem[] = open.map((country) => ({
    key: country.isoCode,
    title: <BackendText>{country.name}</BackendText>,
    tile: (
      <span className="am-icontile am-iso-tile" aria-hidden="true">
        {country.isoCode}
      </span>
    ),
    href: { pathname: "/countries/[countryCode]", params: { countryCode: country.isoCode } }
  }));

  return (
    <>
      <Hero className="am-errorsign" title={t("title")} lead={t("description")}>
        <Directory items={destinations} surface="plate" columns={2} />
      </Hero>

      {countryRows.length > 0 ? (
        <Section title={t("countriesTitle")} spacing="compact">
          <Directory items={countryRows} label={t("countriesTitle")} columns={2} />
        </Section>
      ) : null}
    </>
  );
}
