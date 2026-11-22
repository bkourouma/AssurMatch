import Link from "next/link";
import { redirect } from "next/navigation";
import { readAdminPartners } from "../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readCrmConnectorDeliveries, readCrmConnectorFlag, readCrmConnectors } from "../lib/crm-connector-api";
import {
  Badge,
  Button,
  Card,
  Cluster,
  DataTable,
  PageHeader,
  PageStack,
  StateMessage,
  StatStrip,
  StatusBadge,
  integrationStatusTones
} from "../lib/ui/admin-ui";
import { CreateCrmConnectorForm, CrmStatusForm, RotateSecretForm } from "./crm-forms";
import { readFailureDetail } from "../lib/auth-error-messages";

const PAGE_PATH = "/connecteurs-crm";

/** Current state of a connector and what to do next, worded for the operator (it decides nothing). */
const CONNECTOR_NEXT_STEP: Record<string, string> = {
  disabled: "aucun envoi. Activer le connecteur pour transmettre les événements.",
  active: "envois ouverts pour ce connecteur. Suspendre pour mettre en pause, ou surveiller les livraisons.",
  suspended: "envois en pause. Réactiver ou désactiver le connecteur."
};

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
        kicker="Canaux et intégrations"
        title="Connecteurs CRM"
        description="Transmission sortante des événements lead.assigned et lead.status_changed vers le CRM d'un partenaire. Les connecteurs sont créés désactivés ; la charge utile est minimisée : jamais de nom, d'e-mail, de téléphone ni de texte libre. Chaque action exige un motif audité."
        actions={connectors.status === "success" ? <Button href="#creer-connecteur">Créer un connecteur</Button> : null}
      />

      <nav aria-label="Écrans liés">
        <Link href="/channels">Canaux de messagerie</Link> · <Link href="/partner-integrations">Intégrations partenaires</Link>
      </nav>

      {connectors.status === "forbidden" ? <StateMessage tone="danger">Accès refusé : droit partners:update et MFA requis.</StateMessage> : null}
      {connectors.status === "error" ? <StateMessage tone="danger">Connecteurs CRM indisponibles. {readFailureDetail(connectors.error)}</StateMessage> : null}

      <Card
        title="Activation (hors HTTP)"
        description="L'envoi vers les CRM est fermé par défaut. Son ouverture est une décision d'exploitation appliquée par commande, avec référence de politique et approbateur ; aucun bouton de cet écran ne l'ouvre."
      >
        <p>
          État du flag <code>crm_connector_enabled</code> :{" "}
          {flag.readable ? (
            <Badge tone={flag.value ? "warning" : "disabled"}>{flag.value ? "Actif" : "Désactivé"}</Badge>
          ) : (
            <span data-crm-flag-state="unreadable">état du flag non lisible avec ce rôle</span>
          )}
        </p>
        <p className="bo-description">Commande d'exploitation :</p>
        <pre><code>npm run ops:apply-flag-policy -- --flag crm_connector_enabled --value true --reference ... --approved-by ... --reason ...</code></pre>
        <p className="bo-description">
          Le worker de livraison reste inactif tant que la variable <code>ASSURMATCH_CRM_CONNECTOR_DELIVERY_ENABLED</code> n'est pas positionnée sur son environnement.
        </p>
      </Card>

      {connectors.status === "success" ? (
        <>
          <StatStrip
            label="Synthèse connecteurs CRM"
            items={[
              { label: "Connecteurs", value: connectors.data.total },
              { label: "Actifs", value: items.filter((connector) => connector.status === "active").length, tone: "success" },
              { label: "Livraisons en échec ou dead_letter", value: failedDeliveries, tone: "warning" }
            ]}
          />

          {partners.length === 0 ? <StateMessage tone="warning">Liste des partenaires indisponible : création impossible pour le moment.</StateMessage> : null}

          {failedDeliveries > 0 ? (
            <StateMessage tone="warning">
              {`${failedDeliveries} livraison(s) en échec ou en dead_letter : vérifiez l'hôte et l'en-tête d'authentification du connecteur concerné dans l'historique ci-dessous, puis renouvelez son secret si nécessaire.`}
            </StateMessage>
          ) : null}

          <div id="creer-connecteur">
            <Card title="Créer un connecteur CRM" description="Le connecteur est créé désactivé. Le secret de signature n'est affiché qu'une seule fois.">
              <CreateCrmConnectorForm partners={partners} />
            </Card>
          </div>

          <Card title="Connecteurs">
            <DataTable
              columns={[
                { key: "name", header: "Nom", render: (connector) => <strong>{connector.name}</strong> },
                { key: "partner", header: "Partenaire", render: (connector) => partnerLabels.get(connector.partnerTenantId) ?? <code>{connector.partnerTenantId}</code> },
                { key: "host", header: "Hôte", render: (connector) => <code>{connector.urlHost}</code> },
                { key: "events", header: "Événements", render: (connector) => connector.eventTypes.join(", ") },
                {
                  key: "status",
                  header: "Statut",
                  render: (connector) => (
                    <>
                      <StatusBadge status={connector.status} tones={integrationStatusTones} />
                      {CONNECTOR_NEXT_STEP[connector.status] ? <div className="bo-description">Prochaine étape : {CONNECTOR_NEXT_STEP[connector.status]}</div> : null}
                    </>
                  )
                },
                { key: "auth", header: "En-tête d'auth", render: (connector) => (connector.authHeaderConfigured ? "Oui" : "Non") },
                {
                  key: "actions",
                  header: "Actions",
                  render: (connector) => (
                    <Cluster>
                      <CrmStatusForm connectorId={connector.id} status={connector.status} connectorName={connector.name} />
                      <RotateSecretForm connectorId={connector.id} connectorName={connector.name} />
                    </Cluster>
                  )
                }
              ]}
              items={items}
              getKey={(connector) => connector.id}
              emptyLabel="Aucun connecteur CRM configuré."
              emptyDescription="Créez un connecteur pour un partenaire : il est créé désactivé, puis activé après vérification."
              emptyAction={<Button href="#creer-connecteur" variant="secondary" size="sm">Créer un connecteur</Button>}
              aria-label="Connecteurs CRM"
            />
          </Card>

          <Card title="Historique des livraisons" description="Métadonnées uniquement : aucun contenu de lead n'est affiché.">
            {deliveries.status === "forbidden" ? <StateMessage tone="danger">Accès refusé : droit partners:update et MFA requis.</StateMessage> : null}
            {deliveries.status === "error" ? <StateMessage tone="danger">Historique des livraisons indisponible.</StateMessage> : null}
            <DataTable
              columns={[
                { key: "event", header: "Événement", render: (delivery) => <code>{delivery.eventType}</code> },
                { key: "status", header: "Statut", render: (delivery) => <StatusBadge status={delivery.status} tones={integrationStatusTones} /> },
                { key: "attempts", header: "Tentatives", render: (delivery) => delivery.attemptCount },
                { key: "next", header: "Prochaine tentative", render: (delivery) => formatDate(delivery.nextAttemptAt) },
                { key: "response", header: "Classe de réponse", render: (delivery) => delivery.lastResponseClass ?? "-" },
                { key: "date", header: "Date", render: (delivery) => formatDate(delivery.createdAt) }
              ]}
              items={deliveryItems}
              getKey={(delivery) => delivery.id}
              emptyLabel="Aucune livraison CRM journalisée."
              emptyDescription="Les livraisons apparaissent ici dès qu'un connecteur actif transmet un événement."
              aria-label="Livraisons CRM"
            />
          </Card>
        </>
      ) : null}
    </PageStack>
  );
}
