import { redirect } from "next/navigation";
import { AGENCIES_OVERVIEW_MESSAGES, agenciesOverviewAccess } from "../../lib/agencies-overview";
import { loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { readBrokerAgenciesOverview } from "../../lib/broker-api";
import { Badge, Card, DataTable, Notice, PageHeader, PageStack } from "../../lib/ui/broker-ui";
import { agencyRowLabel, formatCount, formatMinutes, formatRate } from "../../lib/ui/broker-view-models";

/**
 * Lot 3 (spec 069 FR-003, PRD §6.3): consolidated view of the agencies of an Enterprise cabinet
 * (GET /broker/dashboard/agencies): volumes, contact rate, won / received conversion and first-contact
 * delay, plus the « Sans agence » line. Aggregates only, no prospect identity. The API stays the
 * authority (Enterprise plan, roles seeing the whole tenant, audit); a refusal shows a generic message.
 */
const PATH = "/enterprise/agencies";
const BREADCRUMB = [{ label: "Organisation" }, { label: "Entreprise", href: "/enterprise" }, { label: "Vue multi-agences" }];

export default async function BrokerAgenciesOverviewPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(PATH, session.status));
  if (session.status === "mfa_required") redirect(loginRedirect(PATH, "mfa_required"));
  if (session.status !== "authenticated") {
    return (
      <PageStack>
        <PageHeader breadcrumb={BREADCRUMB} kicker="Enterprise" title="Accès refusé" description="La vue multi-agences exige un courtier authentifié et la MFA vérifiée." />
      </PageStack>
    );
  }

  const access = agenciesOverviewAccess(session.profile);
  if (access !== "allowed") {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={BREADCRUMB}
          kicker="Enterprise"
          title="Vue multi-agences"
          description="Comparaison des agences du cabinet : volumes, contact, conversion et délais."
          actions={<Badge tone="disabled">{access === "plan_required" ? "Plan Enterprise requis" : "Rôle non autorisé"}</Badge>}
        />
        <Notice tone="info">{AGENCIES_OVERVIEW_MESSAGES[access]}</Notice>
      </PageStack>
    );
  }

  const overview = await readBrokerAgenciesOverview();
  if (overview.unauthenticated) redirect(loginRedirect(PATH, overview.error ?? "session_required"));

  return (
    <PageStack>
      <PageHeader
        breadcrumb={BREADCRUMB}
        kicker="Enterprise"
        title="Vue multi-agences"
        description="Comparaison des agences du cabinet sur la fenêtre du tableau de bord. La conversion est le rapport gagnés / reçus. Chiffres agrégés, aucune identité de prospect."
        actions={<Badge tone="info">Enterprise</Badge>}
      />
      {overview.status === "forbidden" ? (
        <Notice tone="danger" title="Accès refusé">Cette vue est indisponible pour votre cabinet ou votre rôle. Aucune donnée n&apos;est affichée.</Notice>
      ) : overview.status === "error" ? (
        <Notice tone="warning">La vue multi-agences est momentanément indisponible. Aucune donnée n&apos;est affichée.</Notice>
      ) : (
        <Card title="Agences du cabinet">
          <DataTable
            columns={[
              { key: "agency", header: "Agence", render: (row) => agencyRowLabel(row) },
              { key: "advisors", header: "Conseillers", numeric: true, align: "right", render: (row) => formatCount(row.advisors) },
              { key: "received", header: "Reçus", numeric: true, align: "right", render: (row) => formatCount(row.received) },
              { key: "accepted", header: "Acceptés", numeric: true, align: "right", render: (row) => formatCount(row.accepted) },
              { key: "won", header: "Gagnés", numeric: true, align: "right", render: (row) => formatCount(row.won) },
              { key: "lost", header: "Perdus", numeric: true, align: "right", render: (row) => formatCount(row.lost) },
              { key: "contact", header: "Taux de contact", numeric: true, align: "right", render: (row) => formatRate(row.contactRate) },
              { key: "conversion", header: "Gagnés / reçus", numeric: true, align: "right", render: (row) => formatRate(row.conversionRate) },
              { key: "firstContact", header: "Délai de premier contact", numeric: true, align: "right", render: (row) => formatMinutes(row.averageFirstContactMinutes) }
            ]}
            items={overview.data}
            getKey={(row) => row.agencyId}
            aria-label="Comparaison des agences"
            emptyLabel="Aucune agence à comparer pour le moment."
            dense
          />
        </Card>
      )}
    </PageStack>
  );
}
