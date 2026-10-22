import Link from "next/link";
import { redirect } from "next/navigation";
import { readAdminPartners } from "../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readCrmConnectorDeliveries, readCrmConnectorFlag, readCrmConnectors } from "../lib/crm-connector-api";
import {
  Badge,
  Card,
  DataTable,
  Grid,
  KpiCard,
  PageHeader,
  PageStack,
  StateMessage,
  StatusBadge,
  integrationStatusTones
} from "../lib/ui/admin-ui";
import { CreateCrmConnectorForm, CrmStatusForm, RotateSecretForm } from "./crm-forms";

const PAGE_PATH = "/connecteurs-crm";

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 16).replace("T", " ");
}

export default async function CrmConnectorsPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(PAGE_PATH, session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent(PAGE_PATH)}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect(`/login?error=access_denied&returnTo=${encodeURIComponent(PAGE_PATH)}`);

  const [connectors, deliveries, flag, partnersState] = await Promise.all([
    readCrmConnectors(),
    readCrmConnectorDeliveries(),
    readCrmConnectorFlag(),
    readAdminPartners()
  ]);
  if (connectors.status === "unauthenticated") redirect(loginRedirect(PAGE_PATH, connectors.error ?? "session_required"));

  const partners = (partnersState.status === "success" ? partnersState.data : []).map((partner) => ({ id: partner.id, label: partner.tradeName ?? partner.legalName }));
  const partnerLabels = new Map(partners.map((partner) => [partner.id, partner.label]));
  const items = connectors.data.items;
  const deliveryItems = deliveries.status === "success" ? deliveries.data.items : [];
  const failedDeliveries = deliveryItems.filter((delivery) => delivery.status === "failed" || delivery.status === "dead_letter").length;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Partenaires" }, { label: "Connecteurs CRM" }]}
        kicker="Canaux et integrations"
        title="Connecteurs CRM"
        description="Transmission sortante des evenements lead.assigned et lead.status_changed vers le CRM d'un partenaire. Les connecteurs sont crees desactives ; la charge utile est minimisee : jamais de nom, d'e-mail, de telephone ni de texte libre. Chaque action exige un motif audite."
      />

      <nav aria-label="Ecrans lies">
        <Link href="/channels">Canaux de messagerie</Link> · <Link href="/partner-integrations">Integrations partenaires</Link>
      </nav>

      {connectors.status === "forbidden" ? <StateMessage tone="danger">Acces refuse : droit partners:update et MFA requis.</StateMessage> : null}
      {connectors.status === "error" ? <StateMessage tone="danger">Connecteurs CRM indisponibles ({connectors.error ?? "erreur"}). Reessayez plus tard.</StateMessage> : null}

      <Card
        title="Activation (hors HTTP)"
        description="L'envoi vers les CRM est ferme par defaut. Son ouverture est une decision d'exploitation appliquee par commande, avec reference de politique et approbateur ; aucun bouton de cet ecran ne l'ouvre."
      >
        <p>
          Etat du flag <code>crm_connector_enabled</code> :{" "}
          {flag.readable ? (
            <Badge tone={flag.value ? "warning" : "disabled"}>{flag.value ? "Actif" : "Desactive"}</Badge>
          ) : (
            <span data-crm-flag-state="unreadable">etat du flag non lisible avec ce role</span>
          )}
        </p>
        <p className="bo-description">Commande d'exploitation :</p>
        <pre><code>npm run ops:apply-flag-policy -- --flag crm_connector_enabled --value true --reference ... --approved-by ... --reason ...</code></pre>
        <p className="bo-description">
          Le worker de livraison reste inactif tant que la variable <code>ASSURMATCH_CRM_CONNECTOR_DELIVERY_ENABLED</code> n'est pas positionnee sur son environnement.
        </p>
      </Card>

      {connectors.status === "success" ? (
        <>
          <Grid columns="kpi" as="section" aria-label="Synthese connecteurs CRM">
            <KpiCard label="Connecteurs" value={connectors.data.total} />
            <KpiCard label="Actifs" value={items.filter((connector) => connector.status === "active").length} tone="success" />
            <KpiCard label="Livraisons en echec ou dead_letter" value={failedDeliveries} tone="warning" />
          </Grid>

          {partners.length === 0 ? <StateMessage tone="warning">Liste des partenaires indisponible : creation impossible pour le moment.</StateMessage> : null}

          <Card title="Creer un connecteur CRM" description="Le connecteur est cree desactive. Le secret de signature n'est affiche qu'une seule fois.">
            <CreateCrmConnectorForm partners={partners} />
          </Card>

          <Card title="Connecteurs">
            <DataTable
              columns={[
                { key: "name", header: "Nom", render: (connector) => <strong>{connector.name}</strong> },
                { key: "partner", header: "Partenaire", render: (connector) => partnerLabels.get(connector.partnerTenantId) ?? <code>{connector.partnerTenantId}</code> },
                { key: "host", header: "Hote", render: (connector) => <code>{connector.urlHost}</code> },
                { key: "events", header: "Evenements", render: (connector) => connector.eventTypes.join(", ") },
                { key: "status", header: "Statut", render: (connector) => <StatusBadge status={connector.status} tones={integrationStatusTones} /> },
                { key: "auth", header: "En-tete d'auth", render: (connector) => (connector.authHeaderConfigured ? "Oui" : "Non") },
                {
                  key: "actions",
                  header: "Actions",
                  render: (connector) => (
                    <>
                      <CrmStatusForm connectorId={connector.id} status={connector.status} />
                      <RotateSecretForm connectorId={connector.id} />
                    </>
                  )
                }
              ]}
              items={items}
              getKey={(connector) => connector.id}
              emptyLabel="Aucun connecteur CRM configure."
              aria-label="Connecteurs CRM"
            />
          </Card>

          <Card title="Historique des livraisons" description="Metadonnees uniquement : aucun contenu de lead n'est affiche.">
            {deliveries.status === "forbidden" ? <StateMessage tone="danger">Acces refuse : droit partners:update et MFA requis.</StateMessage> : null}
            {deliveries.status === "error" ? <StateMessage tone="danger">Historique des livraisons indisponible.</StateMessage> : null}
            <DataTable
              columns={[
                { key: "event", header: "Evenement", render: (delivery) => <code>{delivery.eventType}</code> },
                { key: "status", header: "Statut", render: (delivery) => <StatusBadge status={delivery.status} tones={integrationStatusTones} /> },
                { key: "attempts", header: "Tentatives", render: (delivery) => delivery.attemptCount },
                { key: "next", header: "Prochaine tentative", render: (delivery) => formatDate(delivery.nextAttemptAt) },
                { key: "response", header: "Classe de reponse", render: (delivery) => delivery.lastResponseClass ?? "-" },
                { key: "date", header: "Date", render: (delivery) => formatDate(delivery.createdAt) }
              ]}
              items={deliveryItems}
              getKey={(delivery) => delivery.id}
              emptyLabel="Aucune livraison CRM journalisee."
              aria-label="Livraisons CRM"
            />
          </Card>
        </>
      ) : null}
    </PageStack>
  );
}
