import { getTranslations, setRequestLocale } from "next-intl/server";
import { toLocale, type AppLocale } from "../../../i18n/routing";
import { getHowItWorksContent } from "../../content/institutional";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Button } from "../../components/ui/button";
import { Directory } from "../../components/ui/directory";
import { Hero } from "../../components/ui/hero";
import { Icon } from "../../components/ui/icons";
import { Route } from "../../components/ui/route-line";
import { Section } from "../../components/ui/section";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";
import "../../styles/pages/institutional.css";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "HowItWorks" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/how-it-works", locale });
}

/**
 * How it works: the three stops of the journey on the route line (the last one green, the stop where
 * the broker confirms), who does what at each stop, what AssurMatch does not do, then where to go
 * next. The step anchors (`#comparez`, `#demandez`, `#souscrivez`) are kept on the stop titles.
 */
export default async function HowItWorksPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale: AppLocale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("HowItWorks");
  const common = await getTranslations("Common");
  const content = getHowItWorksContent(locale);
  const lastStep = content.steps.length - 1;

  const roles = [
    { key: "visitor", label: t("responsibilitiesColVisitor") },
    { key: "assurMatch", label: t("responsibilitiesColAssurMatch") },
    { key: "broker", label: t("responsibilitiesColBroker") },
    { key: "insurer", label: t("responsibilitiesColInsurer") }
  ] as const;

  return (
    <>
      <Hero
        title={t("title")}
        lead={t("lead")}
        breadcrumb={
          <Breadcrumb
            label={common("breadcrumbLabel")}
            items={[
              { name: common("home"), url: localeUrl(locale, "/") },
              { name: t("breadcrumb"), url: localeUrl(locale, "/how-it-works") }
            ]}
          />
        }
        actions={
          <Button href="/countries" icon={<Icon name="search" size={20} />}>
            {common("compareOffers")}
          </Button>
        }
      />

      <Section title={t("stepsHeading")} lead={t("stepsLead")}>
        <Route
          className="am-hiw-route"
          stops={content.steps.map((step, index) => ({
            key: step.id,
            title: <span id={step.id}>{step.heading}</span>,
            body: (
              <>
                {step.body.map((paragraph, paragraphIndex) => (
                  <span key={paragraphIndex}>{paragraph}</span>
                ))}
              </>
            ),
            ...(index === lastStep ? { state: "confirm" as const } : {})
          }))}
        />
      </Section>

      <Section tone="muted" id="qui-fait-quoi" title={t("responsibilitiesHeading")}>
        <div className="am-table-wrap am-roles__table">
          <table className="am-table">
            <caption className="am-visually-hidden">{t("responsibilitiesHeading")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("responsibilitiesColStep")}</th>
                {roles.map((role) => (
                  <th scope="col" key={role.key}>
                    {role.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {content.responsibilities.map((row) => (
                <tr key={row.step}>
                  <th scope="row">{row.step}</th>
                  {roles.map((role) => (
                    <td key={role.key}>{row[role.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* On a phone the same rows read one step at a time instead of scrolling a five-column table. */}
        <div className="am-roles__steps">
          {content.responsibilities.map((row) => (
            <section className="am-roles__step" key={row.step}>
              <h3 className="am-ruled-title">{row.step}</h3>
              <dl>
                {roles.map((role) => (
                  <div key={role.key}>
                    <dt>{role.label}</dt>
                    <dd>{row[role.key]}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </Section>

      <Section title={content.notDone.heading} id={content.notDone.id}>
        <div className="am-scope">
          {content.notDone.body.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
          {content.notDone.bullets ? (
            <ul className="am-ruled" data-mark="minus">
              {content.notDone.bullets.map((bullet) => (
                <li key={bullet}>
                  <Icon name="minus" size={20} />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Section>

      <Section tone="muted" title={t("linksHeading")} lead={t("linksLead")}>
        <Directory
          label={t("linksHeading")}
          columns={2}
          items={[
            {
              key: "regulatory-status",
              title: t("seeRegulatoryStatus"),
              meta: t("seeRegulatoryStatusHint"),
              icon: "scale",
              href: "/regulatory-status"
            },
            {
              key: "countries",
              title: t("compareCountries"),
              meta: t("compareCountriesHint"),
              icon: "globe",
              href: "/countries"
            }
          ]}
        />
      </Section>
    </>
  );
}
