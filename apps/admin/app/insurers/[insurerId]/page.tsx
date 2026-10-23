import { redirect } from "next/navigation";
import { readAdminCountries } from "../../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { adminReadErrorMessage } from "../../lib/catalog-messages";
import { readAdminInsurer } from "../../lib/lot4-offers-api";
import { INSURER_STATUS_LABELS, INSURER_STATUS_TONES, offerFormatDate } from "../../lib/offer-messages";
import { Card, Cluster, DescriptionList, Notice, PageHeader, PageStack, StateMessage, StatusBadge } from "../../lib/ui/admin-ui";
import { EditInsurerForm, RetireInsurerForm } from "../insurer-forms";

/** Spec 070: one insurer (edit name, approval number, active/suspended; retire with a reason). */
export default async function AdminInsurerPage({
  params,
  searchParams
}: {
  params: Promise<{ insurerId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { insurerId } = await params;
  const query = searchParams ? await searchParams : {};
  const path = `/insurers/${encodeURIComponent(insurerId)}`;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(path, session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent(path)}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect(`/login?error=access_denied&returnTo=${encodeURIComponent(path)}`);

  const [result, countries] = await Promise.all([readAdminInsurer(insurerId), readAdminCountries()]);
  if (result.status === "unauthenticated") redirect(loginRedirect(path, result.error ?? "session_required"));
  const insurer = result.data;
  const breadcrumb = [{ label: "Catalogue", href: "/catalog" }, { label: "Assureurs", href: "/insurers" }, { label: insurer?.name ?? "Assureur" }];
  if (!insurer) {
    return (
      <PageStack>
        <PageHeader breadcrumb={breadcrumb} kicker="Catalogue" title="Assureur introuvable" />
        <StateMessage tone="danger">{adminReadErrorMessage(result.status === "forbidden" ? "access_denied" : result.error ?? "api_404")}</StateMessage>
      </PageStack>
    );
  }
  const country = countries.data.find((item) => item.id === insurer.countryId);
  const notice = query.notice === "created" ? "Assureur créé. Il est disponible dans les formulaires d'offre de son pays." : undefined;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={breadcrumb}
        kicker="Catalogue"
        title={insurer.name}
        description={`${country ? `${country.name} (${country.isoCode})` : "Pays inconnu"} · code ${insurer.code}`}
        actions={<Cluster><StatusBadge status={insurer.status} labels={INSURER_STATUS_LABELS} tones={INSURER_STATUS_TONES} /></Cluster>}
      />
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      <Card title="Fiche">
        <DescriptionList
          items={[
            { term: "Nom", value: insurer.name },
            { term: "Code", value: <code>{insurer.code}</code> },
            { term: "Pays", value: country ? `${country.name} (${country.isoCode})` : insurer.countryId },
            { term: "Numéro d'agrément", value: insurer.approvalNumber ?? "-" },
            { term: "Créé le", value: offerFormatDate(insurer.createdAt) },
            { term: "Mis à jour le", value: offerFormatDate(insurer.updatedAt) }
          ]}
        />
      </Card>
      <EditInsurerForm
        insurer={{
          id: insurer.id,
          name: insurer.name,
          code: insurer.code,
          approvalNumber: insurer.approvalNumber,
          status: insurer.status,
          concurrencyToken: insurer.concurrencyToken
        }}
      />
      {insurer.status === "retired" ? null : <RetireInsurerForm insurerId={insurer.id} />}
    </PageStack>
  );
}
