import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "../../../i18n/navigation";
import { toLocale, type AppLocale } from "../../../i18n/routing";
import { listGuides } from "../../content/guides";
import { Breadcrumb } from "../../components/ui/breadcrumb";
import { Section } from "../../components/ui/section";
import { buildMetadata, localeUrl } from "../../lib/seo";
import type { PageMetadata } from "../../lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<PageMetadata> {
  const locale = toLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Guides" });
  return buildMetadata({ title: t("title"), description: t("description"), href: "/guides", locale });
}

export default async function GuidesIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale: AppLocale = toLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("Guides");
  const common = await getTranslations("Common");
  const guides = listGuides(locale);

  return (
    <>
      <div className="am-container">
        <Breadcrumb
          label={common("breadcrumbLabel")}
          items={[
            { name: common("home"), url: localeUrl(locale, "/") },
            { name: t("breadcrumb"), url: localeUrl(locale, "/guides") }
          ]}
        />
      </div>

      <Section headingLevel={1} title={t("title")} lead={t("lead")}>
        <ul className="pub-cards pub-cards--two">
          {guides.map((guide) => (
            <li className="pub-card" key={guide.slug}>
              <h2 className="pub-card__title">
                <Link href={{ pathname: "/guides/[slug]", params: { slug: guide.slug } }}>{guide.title}</Link>
              </h2>
              <p>{guide.description}</p>
              <p className="pub-meta">{t("updated", { date: guide.updatedAt })}</p>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
