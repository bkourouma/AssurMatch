import { readAdminCountries } from "../../lib/admin-api";
import { readBackOfficeSession } from "../../lib/backoffice-auth";
import { PageHeader, PageStack, StateMessage } from "../../lib/ui/admin-ui";
import { ConsentRecordSearch } from "./consent-record-search";

/**
 * Spec 059 follow-up: consent-proof search for compliance (`POST /admin/consent-records/search`).
 * Reserved to compliance_admin and super_admin (the API re-checks the role and MFA and audits every
 * search). Proofs show the text version and hash, the intended recipient, the dates and a
 * truncated subject fingerprint; never an e-mail or a phone number.
 */

const SEARCH_ROLES = new Set(["super_admin", "compliance_admin"]);

export default async function ConsentRecordsPage() {
  const session = await readBackOfficeSession();
  const allowed = session.status === "authenticated" && session.profile.roles.some((role) => SEARCH_ROLES.has(role));
  const countries = allowed ? await readAdminCountries() : undefined;
  const options = (countries?.status === "success" ? countries.data : []).map((country) => ({ id: country.id, label: `${country.isoCode} - ${country.name}` }));

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Conformite", href: "/compliance" }, { label: "Preuves de consentement" }]}
        kicker="Conformite"
        title="Preuves de consentement"
        description="Retrouver la preuve d'un consentement : texte accepte (version et empreinte), finalite, destinataire prevu, dates d'accord et de retrait. Chaque recherche est journalisee."
      />
      {session.status !== "authenticated" ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {session.status === "authenticated" && !allowed ? (
        <StateMessage tone="danger">Recherche reservee a la conformite (compliance_admin) et au Super Admin.</StateMessage>
      ) : null}
      {allowed ? <ConsentRecordSearch countries={options} /> : null}
    </PageStack>
  );
}
