import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale } from "../../../i18n/routing";
import { ContactForm, type ContactFormLabels } from "../../components/forms/contact-form";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Section } from "../../components/ui/section";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";

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

  const labels: ContactFormLabels = {
    audienceLegend: t("audienceLegend"),
    audienceOptions: [
      { value: "visitor", label: t("audienceVisitor"), description: t("audienceVisitorHint") },
      { value: "broker", label: t("audienceBroker"), description: t("audienceBrokerHint") },
      { value: "insurer", label: t("audienceInsurer"), description: t("audienceInsurerHint") },
      { value: "press", label: t("audiencePress"), description: t("audiencePressHint") }
    ],
    name: t("nameLabel"),
    email: t("emailLabel"),
    phone: t("phoneLabel"),
    country: t("countryLabel"),
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
    successReferenceTemplate: t("successReference"),
    newMessage: t("newMessage")
  };

  return (
    <>
      <div className="am-container">
        <Breadcrumb
          label={common("breadcrumbLabel")}
          items={[
            { name: common("home"), url: localeUrl(locale, "/") },
            { name: t("breadcrumb"), url: localeUrl(locale, "/contact") }
          ]}
        />
      </div>

      <Section headingLevel={1} title={t("title")} lead={t("lead")}>
        <ContactForm labels={labels} />
      </Section>
    </>
  );
}
