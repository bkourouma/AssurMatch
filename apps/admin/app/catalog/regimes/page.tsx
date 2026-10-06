import { redirect } from "next/navigation";
import { readAdminCountries, readRegulatoryRegimes } from "../../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { adminReadErrorMessage, formatDate } from "../../lib/catalog-messages";
import {
  Card,
  DataTable,
  PageHeader,
  PageStack,
  StateMessage,
  StatusBadge,
  regimeStatusTones
} from "../../lib/ui/admin-ui";
import { CreateRegimeForm, EditRegimeForm, RetireRegimeForm } from "../catalog-forms";

export default async function CatalogRegimesPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/catalog/regimes", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/catalog/regimes")}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Fcatalog%2Fregimes");

  const [regimes, countries] = await Promise.all([readRegulatoryRegimes(), readAdminCountries()]);
  if (regimes.unauthenticated) redirect(loginRedirect("/catalog/regimes", regimes.error ?? "session_required"));
  const referencedBy = (regimeId: string) => countries.data.filter((country) => country.regulatoryRegimeId === regimeId).map((country) => country.isoCode);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Catalogue", href: "/catalog" }, { label: "Regimes" }]}
        kicker="Catalogue"
        title="Regimes reglementaires"
        description="Régimes référencés par les pays. Un régime référencé par un pays ne peut pas être retiré ; un pays sans régime reste bloqué par la checklist."
      />

      {regimes.forbidden ? <StateMessage tone="danger">{adminReadErrorMessage("access_denied")}</StateMessage> : null}
      {regimes.status === "error" ? <StateMessage tone="danger">{adminReadErrorMessage(regimes.error)}</StateMessage> : null}

      {regimes.status === "success" ? (
        <>
          <Card title="Regimes">
            <DataTable
              columns={[
                { key: "key", header: "Clé", render: (regime) => <code>{regime.key}</code> },
                { key: "name", header: "Nom", render: (regime) => regime.name },
                { key: "status", header: "Statut", render: (regime) => <StatusBadge status={regime.status} tones={regimeStatusTones} /> },
                { key: "retention", header: "Conservation", render: (regime) => (regime.retentionOverrideYears ? `${regime.retentionOverrideYears} ans` : "Par défaut") },
                { key: "review", header: "Revue avant activation", render: (regime) => (regime.requiresManualActivationReview ? "Oui" : "Non") },
                { key: "countries", header: "Pays", render: (regime) => referencedBy(regime.id).join(", ") || "-" },
                { key: "updated", header: "Mis à jour", render: (regime) => formatDate(regime.updatedAt) }
              ]}
              items={regimes.data}
              getKey={(regime) => regime.id}
              emptyLabel="Aucun régime : les pays ne peuvent pas passer la checklist d'activation."
              aria-label="Regimes reglementaires"
            />
          </Card>

          <CreateRegimeForm />

          {regimes.data.filter((regime) => regime.status !== "retired").map((regime) => (
            <Card key={regime.id} title={`Modifier ${regime.name}`} description={`Clé ${regime.key} (non modifiable).`}>
              <EditRegimeForm regime={regime} />
              {referencedBy(regime.id).length > 0 ? (
                <p className="bo-description">{`Retrait impossible : référencé par ${referencedBy(regime.id).join(", ")}.`}</p>
              ) : (
                <RetireRegimeForm regime={regime} />
              )}
            </Card>
          ))}
        </>
      ) : null}
    </PageStack>
  );
}
