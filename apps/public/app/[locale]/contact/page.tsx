import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../i18n/routing";
import { ContactForm, type ContactFormLabels } from "../../components/forms/contact-form";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { Card, CardFooter, CardTitle } from "../../components/ui/card";
import { Hero } from "../../components/ui/hero";
import { Icon } from "../../components/ui/icons";
import { Section } from "../../components/ui/section";
import { listCountryDirectory } from "../../lib/public-api";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";
import "../../styles/pages/institutional.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Contact" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/contact", locale });
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Contact");
  const forms = await getTranslations("Forms");
  const common = await getTranslations("Common");

  // The "Pays concerné" select is fed by the same directory the rest of the site reads. A directory
  // outage leaves the select with its "Non précisé" option only - the field is optional anyway.
  const directory = await listCountryDirectory();
  const countries = directory.data.map((country) => ({ isoCode: country.isoCode, name: country.name }));

  const labels: ContactFormLabels = {
    audienceLegend: t("audienceLegend"),
    audienceOptions: [
      { value: "visitor", label: t("audienceVisitor"), description: t("audienceVisitorHint"), icon: "user" },
      { value: "broker", label: t("audienceBroker"), description: t("audienceBrokerHint"), icon: "briefcase" },
      { value: "insurer", label: t("audienceInsurer"), description: t("audienceInsurerHint"), icon: "building-2" },
      { value: "press", label: t("audiencePress"), description: t("audiencePressHint"), icon: "newspaper" }
    ],
    name: t("nameLabel"),
    email: t("emailLabel"),
    phone: t("phoneLabel"),
    country: t("countryLabel"),
    countryUnspecified: t("countryUnspecified"),
    errorSummary: t("errorSummary"),
    subject: t("subjectLabel"),
    message: t("messageLabel"),
    honeypot: t("honeypotLabel"),
    consent: t("consentLabel"),
    consentRequired: t("consentRequired"),
    consentHintPrefix: t("consentHintPrefix"),
    privacyLinkLabel: t("privacyLinkLabel"),
    requiredMark: forms("requiredMark"),
    fieldRequired: forms("fieldRequired"),
    invalidEmail: forms("invalidEmail"),
    submit: t("submit"),
    sending: t("sending"),
    successTitle: t("successTitle"),
    successBody: t("successBody"),
    // The client component substitutes the real reference into this template once the API answers.
    // The literal "{reference}" is passed as the value of the ICU variable on purpose: asking for the
    // message without providing `reference` is what used to raise FORMATTING_ERROR while rendering
    // this page, even though the reference does not exist yet at that point.
    successReferenceTemplate: t("successReference", { reference: "{reference}" }),
    newMessage: t("newMessage")
  };

  return (
    <>
      <Hero
        kicker={t("kicker")}
        title={t("title")}
        lead={t("lead")}
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: t("breadcrumb"), url: localeUrl(locale, "/contact") }
            ]}
          />
        }
      />

      <Section>
        <div className="am-contact-layout">
          <Card padding="lg">
            <CardTitle as="h2">{t("formTitle")}</CardTitle>
            <ContactForm labels={labels} countries={countries} />
          </Card>

          <aside className="am-contact-aside" aria-label={t("asideTitle")}>
            <Card tone="muted" padding="lg">
              <CardTitle as="h2">{t("asideTitle")}</CardTitle>
              <ul className="am-contact-aside__list">
                <li>
                  <Icon name="clock" size={18} />
                  <span>{t("asideResponse")}</span>
                </li>
                <li>
                  <Icon name="scale" size={18} />
                  <span>{t("asideNoAdvice")}</span>
                </li>
                <li>
                  <Icon name="lock" size={18} />
                  <span>{t("asidePrivacy")}</span>
                </li>
                <li>
                  <Icon name="help-circle" size={18} />
                  <span>{t("asideFaq")}</span>
                </li>
              </ul>
              <CardFooter>
                <Button href="/faq" variant="secondary" iconAfter={<Icon name="arrow-right" size={18} />}>
                  {t("asideFaqLink")}
                </Button>
              </CardFooter>
            </Card>
          </aside>
        </div>
      </Section>
    </>
  );
}
