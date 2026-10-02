import { getTranslations, setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Link } from "../../../i18n/navigation";
import { toLocale, type AppLocale } from "../../../i18n/routing";
import { ContactForm, type ContactFormLabels } from "../../components/forms/contact-form";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { Card, CardFooter, CardTitle } from "../../components/ui/card";
import { Hero } from "../../components/ui/hero";
import { Icon } from "../../components/ui/icons";
import { Notice } from "../../components/ui/notice";
import { Section } from "../../components/ui/section";
import { listCountryDirectory, submitContact, type ContactSubmission } from "../../lib/public-api";
import { buildMetadata, localePath, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";
import "../../styles/pages/institutional.css";

/**
 * Spec 050 D6: `contact/page.tsx` carries its own no-JavaScript fallback. `submitContactAction` below
 * is the server action bound to the form; on success it redirects back here with `?sent=1` (never any
 * personal data) so the success state renders server-side, and on failure with `?formError=<key>` that
 * this page maps to the same localized copy the client shows.
 */

type SearchParams = Record<string, string | string[] | undefined>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/;
const KNOWN_CONTACT_ERROR_KEYS = ["contactFailed", "rateLimited", "apiUnavailable"] as const;
type KnownContactErrorKey = (typeof KNOWN_CONTACT_ERROR_KEYS)[number];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Contact" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/contact", locale });
}

export default async function ContactPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const locale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Contact");
  const forms = await getTranslations("Forms");
  const common = await getTranslations("Common");
  const api = await getTranslations("Api");

  // The "Pays concerné" select is fed by the same directory the rest of the site reads. A directory
  // outage leaves the select with its "Non précisé" option only - the field is optional anyway.
  const directory = await listCountryDirectory();
  const countries = directory.data.map((country) => ({ isoCode: country.isoCode, name: country.name }));

  const query = searchParams ? await searchParams : {};
  const sent = first(query.sent) === "1";
  const formErrorParam = first(query.formError);
  const formErrorText =
    formErrorParam === "consent"
      ? t("consentRequired")
      : formErrorParam === "fieldRequired"
        ? forms("fieldRequired")
        : formErrorParam && (KNOWN_CONTACT_ERROR_KEYS as readonly string[]).includes(formErrorParam)
          ? api(formErrorParam as KnownContactErrorKey)
          : undefined;

  /**
   * D6: the browser's native submission of the form (no JavaScript) posts here directly. With
   * JavaScript, `ContactForm` calls `preventDefault()` in its own submit handler and this action is
   * never reached - the visible behaviour (inline field errors) only exists client-side.
   */
  async function submitContactAction(boundLocale: AppLocale, formData: FormData): Promise<void> {
    "use server";
    const contactPathname = "/contact" as const;
    const backToContact = (errorKey: string): never => {
      redirect(`${localePath(boundLocale, contactPathname)}?formError=${encodeURIComponent(errorKey)}`);
    };

    if (formData.get("consent") !== "on") {
      backToContact("consent");
    }

    const audienceRaw = String(formData.get("audience") ?? "visitor");
    const audience: ContactSubmission["audience"] =
      audienceRaw === "broker" || audienceRaw === "insurer" || audienceRaw === "press" ? audienceRaw : "visitor";
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const countryCodeRaw = String(formData.get("countryCode") ?? "").trim();
    const subject = String(formData.get("subject") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    // Honeypot: a real visitor never fills this field. It is forwarded as-is so the public API's abuse
    // guard rejects the submission exactly as it does for a JavaScript-driven one.
    const website = String(formData.get("website") ?? "").trim();

    if (!name || !email || !EMAIL_PATTERN.test(email) || !subject || !message) {
      backToContact("fieldRequired");
    }

    const incoming = await headers();
    const forwardedFor = incoming.get("x-forwarded-for")?.split(",")[0]?.trim() || incoming.get("x-real-ip")?.trim() || undefined;

    const response = await submitContact(
      {
        audience,
        name,
        email,
        subject,
        message,
        consent: true,
        // The no-JavaScript path must pick the confirmation e-mail language like the client form does.
        locale: boundLocale,
        ...(website ? { website } : {}),
        ...(phone ? { phone } : {}),
        ...(COUNTRY_CODE_PATTERN.test(countryCodeRaw) ? { countryCode: countryCodeRaw.toUpperCase() } : {})
      },
      { forwardedFor }
    );

    if (response.status !== "success") {
      backToContact(response.messageKey ?? "contactFailed");
      return;
    }

    redirect(`${localePath(boundLocale, contactPathname)}?sent=1`);
  }

  const boundSubmitContactAction = submitContactAction.bind(null, locale);

  const labels: ContactFormLabels = {
    audienceLegend: t("audienceLegend"),
    audienceOptions: [
      { value: "visitor", label: t("audienceVisitor"), description: t("audienceVisitorHint"), icon: "user" },
      { value: "broker", label: t("audienceBroker"), description: t("audienceBrokerHint"), icon: "briefcase" },
      { value: "insurer", label: t("audienceInsurer"), description: t("audienceInsurerHint"), icon: "building-2" },
      { value: "press", label: t("audiencePress"), description: t("audiencePressHint"), icon: "newspaper" }
    ],
    name: t("nameLabel"),
    nameHint: t("nameHint"),
    email: t("emailLabel"),
    emailHint: t("emailHint"),
    phone: t("phoneLabel"),
    phoneHint: t("phoneHint"),
    country: t("countryLabel"),
    countryHint: t("countryHint"),
    countryUnspecified: t("countryUnspecified"),
    errorSummary: t("errorSummary"),
    subject: t("subjectLabel"),
    subjectHint: t("subjectHint"),
    message: t("messageLabel"),
    messageHint: t("messageHint"),
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
            {sent ? (
              <Notice tone="success" title={t("successTitle")} role="status">
                <p>{t("successBody")}</p>
                <Button href="/contact" variant="secondary">
                  {t("newMessage")}
                </Button>
              </Notice>
            ) : (
              <>
                {formErrorText ? (
                  <Notice tone="error" role="alert">
                    {formErrorText}
                  </Notice>
                ) : null}
                <ContactForm labels={labels} countries={countries} formAction={boundSubmitContactAction} />
              </>
            )}
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
                  <Icon name="shield-check" size={18} />
                  <span>
                    {t("asideCommitment")} <Link href="/our-commitment">{t("asideCommitmentLink")}</Link>.
                  </span>
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
