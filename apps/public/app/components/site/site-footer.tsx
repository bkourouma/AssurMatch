import { getTranslations } from "next-intl/server";
import { BackendText } from "../ui/backend-text";
import { Logo } from "../ui/logo";
import { Link } from "../../../i18n/navigation";
import type { AppLocale } from "../../../i18n/routing";
import { listPublicProducts } from "../../lib/public-api";
import { brokerLoginUrl } from "../../lib/site-config";
import { readVisitorCountry } from "../../lib/visitor-country";

/**
 * Footer on primary-700: countries, products, guides, legal pages, the partner column pointing at the
 * separate broker application, contact, and the full regulatory sentence. On the English site an
 * extra line warns that partner-provided content stays in French.
 */
export async function SiteFooter({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("Layout.footer");
  const common = await getTranslations("Common");
  const visitor = await readVisitorCountry();

  const countries = visitor.directory.slice(0, 6);
  const productCountry = visitor.isoCode ?? countries[0]?.isoCode;
  const products = productCountry ? (await listPublicProducts(productCountry)).data.slice(0, 6) : [];

  return (
    <footer className="am-footer" aria-label={t("label")}>
      <div className="am-container">
        <div className="am-footer__brand">
          <Logo variant="white" height={32} />
          <p className="am-footer__tagline">{t("tagline")}</p>
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
                <Link href="/guides">{t("columns.guides")}</Link>
              </li>
              <li>
                <Link href="/faq">{t("contactLinks.faq")}</Link>
              </li>
              <li>
                <Link href="/glossary">{t("contactLinks.glossary")}</Link>
              </li>
              <li>
                <Link href="/how-it-works">{common("home")}</Link>
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

          <div className="am-footer__column">
            <h3>{t("columns.contact")}</h3>
            <ul className="am-footer__list">
              <li>
                <Link href="/contact">{t("contactLinks.contact")}</Link>
              </li>
            </ul>
          </div>
        </div>

        <p className="am-footer__legal">{t("regulatorySentence")}</p>
        <p className="am-footer__note">{t("sponsoredSentence")}</p>
        {locale === "en" ? <p className="am-footer__note">{common("backendContentInFrench")}</p> : null}
      </div>
    </footer>
  );
}
