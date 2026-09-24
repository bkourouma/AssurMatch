import { getTranslations } from "next-intl/server";
import { BackendText } from "../ui/backend-text";
import { Button } from "../ui/button";
import { Icon } from "../ui/icons";
import { LanguageSwitcher } from "../ui/language-switcher";
import { Logo } from "../ui/logo";
import { Link } from "../../../i18n/navigation";
import type { AppLocale } from "../../../i18n/routing";
import { listPublicProducts } from "../../lib/public-api";
import { brokerLoginUrl } from "../../lib/site-config";
import { readVisitorCountry } from "../../lib/visitor-country";

/**
 * Navy footer: brand and contact card, five link columns (countries, products, guides, legal, the
 * separate broker application), then the full regulatory sentence in its own panel and a bottom bar
 * with the copyright, the legal mini-links, the language switcher and a back-to-top link. On the
 * English site an extra line warns that partner-provided content stays in French.
 *
 * No social icons: the site has no account to link to, and a row of icons pointing at "#" would be a
 * decoration pretending to be a link.
 */
export async function SiteFooter({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("Layout.footer");
  const layout = await getTranslations("Layout");
  const common = await getTranslations("Common");
  const visitor = await readVisitorCountry();

  const countries = visitor.directory.slice(0, 6);
  const productCountry = visitor.isoCode ?? countries[0]?.isoCode;
  const products = productCountry ? (await listPublicProducts(productCountry)).data.slice(0, 6) : [];
  const year = new Date().getFullYear();
  const languageNames: Record<AppLocale, string> = { fr: layout("languageSwitcher.fr"), en: layout("languageSwitcher.en") };

  return (
    <footer className="am-footer" aria-label={t("label")}>
      <div className="am-container">
        <div className="am-footer__top">
          <div className="am-footer__brand">
            <Logo variant="white" height={32} />
            <p className="am-footer__tagline">{t("tagline")}</p>

            <div className="am-footer__contact">
              <h3>{t("columns.contact")}</h3>
              {/* Default size, not `sm`: at 390px this is the footer's only button and 40px was under
                  the 44px tap target the rest of the chrome holds to. */}
              <Button href="/contact" variant="secondary" icon={<Icon name="mail" size={18} />}>
                {t("contactLinks.contact")}
              </Button>
            </div>
          </div>

          <div className="am-footer__columns">
            <div className="am-footer__column">
              <h3>{t("columns.countries")}</h3>
              <ul className="am-footer__list">
                {countries.map((country) => (
                  <li key={country.isoCode}>
                    <Link href={{ pathname: "/countries/[countryCode]", params: { countryCode: country.isoCode } }}>
                      <BackendText>{country.name}</BackendText>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/countries">{common("compareOffers")}</Link>
                </li>
              </ul>
            </div>

            <div className="am-footer__column">
              <h3>{t("columns.products")}</h3>
              <ul className="am-footer__list">
                {productCountry && products.length > 0 ? (
                  products.map((product) => (
                    <li key={product.id}>
                      <Link
                        href={{
                          pathname: "/countries/[countryCode]/products/[productKey]",
                          params: { countryCode: productCountry, productKey: product.key }
                        }}
                      >
                        <BackendText>{product.name}</BackendText>
                      </Link>
                    </li>
                  ))
                ) : (
                  <li>
                    <Link href="/countries">{common("products")}</Link>
                  </li>
                )}
              </ul>
            </div>

            <div className="am-footer__column">
              <h3>{t("columns.guides")}</h3>
              <ul className="am-footer__list">
                <li>
                  <Link href="/guides">{t("allGuides")}</Link>
                </li>
                <li>
                  <Link href="/faq">{t("contactLinks.faq")}</Link>
                </li>
                <li>
                  <Link href="/glossary">{t("contactLinks.glossary")}</Link>
                </li>
                <li>
                  <Link href="/how-it-works">{layout("nav.howItWorks")}</Link>
                </li>
              </ul>
            </div>

            <div className="am-footer__column">
              <h3>{t("columns.legal")}</h3>
              <ul className="am-footer__list">
                <li>
                  <Link href="/legal-notice">{t("legal.legalNotice")}</Link>
                </li>
                <li>
                  <Link href="/privacy">{t("legal.privacy")}</Link>
                </li>
                <li>
                  <Link href="/cookies">{t("legal.cookies")}</Link>
                </li>
                <li>
                  <Link href="/terms">{t("legal.terms")}</Link>
                </li>
                <li>
                  <Link href="/regulatory-status">{t("legal.regulatoryStatus")}</Link>
                </li>
              </ul>
            </div>

            <div className="am-footer__column">
              <h3>{t("columns.brokers")}</h3>
              <ul className="am-footer__list">
                <li>
                  <Link href="/brokers/apply">{t("brokers.apply")}</Link>
                </li>
                <li>
                  <Link href="/brokers/pricing">{t("brokers.pricing")}</Link>
                </li>
                <li>
                  <a href={brokerLoginUrl}>{t("brokers.login")}</a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="am-footer__regulatory">
          <Icon name="shield-check" size={22} className="am-footer__shield" />
          <div>
            <p className="am-footer__legal">{t("regulatorySentence")}</p>
            <p className="am-footer__note">{t("sponsoredSentence")}</p>
            {locale === "en" ? <p className="am-footer__note">{common("backendContentInFrench")}</p> : null}
          </div>
        </div>

        <div className="am-footer__bottom">
          <p className="am-footer__copyright">
            © <span className="am-tabular">{year}</span> AssurMatch — {t("rights")}
          </p>

          <ul className="am-footer__mini">
            <li>
              <Link href="/legal-notice">{t("legal.legalNotice")}</Link>
            </li>
            <li>
              <Link href="/privacy">{t("legal.privacy")}</Link>
            </li>
            <li>
              <Link href="/cookies">{t("legal.cookies")}</Link>
            </li>
            <li>
              <Link href="/terms">{t("legal.terms")}</Link>
            </li>
          </ul>

          <div className="am-footer__tools">
            <LanguageSwitcher currentLocale={locale} label={layout("languageSwitcher.label")} names={languageNames} tone="invert" />
            <a className="am-footer__totop" href="#am-site-header">
              <Icon name="chevron-up" size={16} />
              <span>{t("backToTop")}</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
