import { redirect } from "next/navigation";
import {
  readAdminCountries,
  readAdminPartnerApplication,
  readAdminProducts
} from "../../../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../../lib/backoffice-auth";
import { adminReadErrorMessage } from "../../../lib/catalog-messages";
import {
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_TONES,
  PARTNER_PLAN_LABELS,
  REJECTION_REASON_LABELS,
  canDecidePartner,
  canReviewApplication,
  partnerFormatDate
} from "../../../lib/partner-messages";
import {
  Button,
  Card,
  Cluster,
  DescriptionList,
  Grid,
  Notice,
  PageHeader,
  PageStack,
  StateMessage,
  StatusBadge
} from "../../../lib/ui/admin-ui";
import { ConvertApplicationForm, RejectApplicationForm, ReviewApplicationForm } from "../application-forms";

/**
 * Spec 051 US5/US7: application detail. The full contact e-mail is served by the API to the roles
 * that decide only; for the others it arrives masked. Conversion and refusal are final.
 */
interface ApplicationDetailPageProps {
  params: Promise<{ applicationId: string }>;
}

export default async function PartnerApplicationDetailPage({ params }: ApplicationDetailPageProps) {
  const { applicationId } = await params;
  const path = `/partners/applications/${applicationId}`;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(path, session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent(path)}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect(`/login?error=access_denied&returnTo=${encodeURIComponent(path)}`);
  const canDecide = canDecidePartner(session.profile.roles);
  const canReview = canReviewApplication(session.profile.roles);

  const [applicationResult, countries, products] = await Promise.all([
    readAdminPartnerApplication(applicationId),
    readAdminCountries(),
    readAdminProducts()
  ]);
  if (applicationResult.unauthenticated) redirect(loginRedirect(path, applicationResult.error ?? "session_required"));
  const application = applicationResult.data;

  if (!application) {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "Partenaires" }, { label: "Candidatures", href: "/partners/applications" }, { label: "Detail" }]}
          title="Candidature indisponible"
          actions={<Button href="/partners/applications" variant="secondary">Retour aux candidatures</Button>}
        />
        <StateMessage tone="danger">{adminReadErrorMessage(applicationResult.error)}</StateMessage>
      </PageStack>
    );
  }

  const country = countries.data.find((entry) => entry.id === application.countryId);
  const productById = new Map(products.data.map((product) => [product.id, product]));
  const decided = application.status === "accepted" || application.status === "rejected";

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Partenaires" }, { label: "Candidatures", href: "/partners/applications" }, { label: application.publicReference }]}
        kicker="Candidature courtier"
        title={application.tradeName || application.legalName}
        description="Une candidature n'active jamais un courtier. La conversion crée un courtier Prospect et une licence brouillon à faire vérifier."
        actions={
          <Cluster>
            <StatusBadge status={application.status} labels={APPLICATION_STATUS_LABELS} tones={APPLICATION_STATUS_TONES} />
            <Button href="/partners/applications" variant="secondary">Retour aux candidatures</Button>
          </Cluster>
        }
      />

      <Grid columns="two">
        <Card title="Cabinet">
          <DescriptionList
            items={[
              { term: "Référence", value: application.publicReference },
              { term: "Raison sociale", value: application.legalName },
              { term: "Nom commercial", value: application.tradeName ?? "-" },
              { term: "Pays", value: country ? `${country.name} (${country.isoCode})` : application.countryId },
              { term: "Plan souhaité", value: PARTNER_PLAN_LABELS[application.desiredPlan as keyof typeof PARTNER_PLAN_LABELS] ?? application.desiredPlan },
              { term: "Capacité mensuelle", value: `${application.monthlyCapacity} leads` },
              { term: "Produits", value: application.productIds.map((id) => productById.get(id)?.name ?? id).join(", ") || "-" },
              { term: "Langue", value: application.locale ?? "fr" },
              { term: "Reçue le", value: partnerFormatDate(application.createdAt) }
            ]}
          />
        </Card>
        <Card title="Licence déclarée et contact">
          <DescriptionList
            items={[
              { term: "Numéro de licence", value: application.licenseNumber },
              { term: "Autorité", value: application.licenseIssuingAuthority ?? "-" },
              { term: "Expiration", value: partnerFormatDate(application.licenseExpiresAt) },
              { term: "Contact", value: application.contactName },
              {
                term: "E-mail",
                value: application.contactEmail
                  ? `${application.contactEmail}${application.contactEmailMasked ? " (masqué)" : ""}`
                  : "Masqué : visible de la conformité uniquement"
              },
              { term: "Téléphone", value: application.contactPhone },
              { term: "WhatsApp", value: application.whatsapp ?? "-" }
            ]}
          />
          {application.message ? <p className="bo-description">Message : {application.message}</p> : null}
        </Card>
      </Grid>

      <Card title="Décision">
        {decided ? (
          <>
            <Notice tone={application.status === "accepted" ? "success" : "info"}>
              {application.status === "accepted"
                ? "Candidature convertie : la décision est définitive."
                : `Candidature refusée (${REJECTION_REASON_LABELS[application.rejectionReasonCode ?? ""] ?? "motif non précisé"}) : la décision est définitive.`}
            </Notice>
            <DescriptionList
              items={[
                { term: "Décidée le", value: partnerFormatDate(application.decidedAt ?? application.reviewedAt ?? null) },
                ...(application.reviewNote ? [{ term: "Note interne", value: application.reviewNote }] : [])
              ]}
            />
            {application.partnerTenantId ? <Button href={`/partners/${encodeURIComponent(application.partnerTenantId)}`}>Ouvrir la fiche courtier</Button> : null}
          </>
        ) : (
          <>
            {application.status === "received" && canReview ? <ReviewApplicationForm applicationId={application.id} /> : null}
            {canDecide ? (
              <Cluster>
                <ConvertApplicationForm applicationId={application.id} />
                <RejectApplicationForm applicationId={application.id} />
              </Cluster>
            ) : (
              <p className="bo-description">La conversion et le refus sont réservés à la conformité (compliance_admin, super_admin).</p>
            )}
          </>
        )}
      </Card>
    </PageStack>
  );
}
