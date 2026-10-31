import { readAdminPartners, readPartnerIntegrations } from "../lib/admin-api";
import {
  Badge,
  Card,
  Cluster,
  DataTable,
  Grid,
  PageHeader,
  PageStack,
  Stack,
  StateMessage,
  StatStrip,
  StatusBadge,
  integrationStatusTones
} from "../lib/ui/admin-ui";
import {
  CreateAllowlistForm,
  CreateApiKeyForm,
  CreateWebhookEndpointForm,
  EndpointStatusForm,
  RevokeAllowlistForm,
  RevokeApiKeyForm,
  TestEventForm
} from "./integration-forms";

export default async function PartnerIntegrationsPage() {
  const [integrations, partnersState] = await Promise.all([readPartnerIntegrations(), readAdminPartners()]);
  const partners = (partnersState.status === "success" ? partnersState.data : []).map((partner) => ({ id: partner.id, label: partner.tradeName ?? partner.legalName }));

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Partenaires" }, { label: "Intégrations" }]}
        title="Partner API et webhooks"
        description="Gestion des clés API hachées, des endpoints webhook (désactivés par défaut, flags partner_api_enabled et partner_webhooks_enabled fermés par défaut) et journaux de livraison metadata-only. Chaque action exige un motif audité."
      />

      {integrations.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {integrations.forbidden ? <StateMessage tone="danger">Accès intégrations refusé pour ce rôle admin.</StateMessage> : null}
      {integrations.status === "error" ? <StateMessage tone="danger">Intégrations indisponibles: {integrations.error}</StateMessage> : null}

      {integrations.status === "success" ? (
        <>
          <StatStrip
            label="Synthèse intégrations partenaires"
            items={[
              { label: "Clés API", value: integrations.data.apiKeys.total },
              { label: "Endpoints webhook", value: integrations.data.webhookEndpoints.total },
              { label: "Origines autorisées", value: integrations.data.webhookAllowlist.total },
              { label: "Livraisons journalisées", value: integrations.data.webhookDeliveries.total }
            ]}
          />

          <Card title="Garde-fous actifs">
            <Stack>
              <Cluster>
                <Badge tone="disabled">partner_api_enabled: désactivé par défaut</Badge>
                <Badge tone="disabled">partner_webhooks_enabled: désactivé par défaut</Badge>
                <Badge tone="success">clés hachées Argon2</Badge>
                <Badge tone="success">secrets webhook chiffres</Badge>
                <Badge tone="success">allow-list tenant obligatoire</Badge>
                <Badge tone="disabled">redirects HTTP bloqués</Badge>
              </Cluster>
              <p>
                Événements autorisés : <span className="bo-ref">lead.assigned</span>, <span className="bo-ref">lead.status_changed</span>,{" "}
                <span className="bo-ref">notification.failed</span>.
              </p>
            </Stack>
          </Card>

          {partners.length === 0 ? <StateMessage tone="warning">Liste des partenaires indisponible : création impossible pour le moment.</StateMessage> : null}

          <Grid columns="two">
            <Card title="Créer une clé API">
              <CreateApiKeyForm partners={partners} />
            </Card>
            <Card title="Créer un endpoint webhook">
              <CreateWebhookEndpointForm partners={partners} />
            </Card>
          </Grid>

          <Card title="Clés API">
            <DataTable
              columns={[
                { key: "name", header: "Nom", render: (key) => <strong>{key.name}</strong> },
                { key: "partner", header: "Partenaire", render: (key) => <span className="bo-ref">{key.partnerTenantId}</span> },
                { key: "prefix", header: "Préfixe", render: (key) => <span className="bo-ref">{key.keyPrefix}</span> },
                { key: "scopes", header: "Scopes", render: (key) => key.scopes.join(", ") },
                { key: "status", header: "Statut", render: (key) => <StatusBadge status={key.status} tones={integrationStatusTones} /> },
                { key: "actions", header: "Actions", render: (key) => key.status === "active" ? <RevokeApiKeyForm keyId={key.id} /> : "-" }
              ]}
              items={integrations.data.apiKeys.items}
              getKey={(key) => key.id}
              emptyLabel="Aucune clé API partenaire configurée."
              aria-label="Clés API partenaires"
            />
          </Card>

          <Card title="Ajouter une origine autorisée">
            <CreateAllowlistForm partners={partners} />
          </Card>

          <Card title="Allow-list webhook">
            <DataTable
              columns={[
                { key: "origin", header: "Origine", render: (entry) => <span className="bo-ref">{entry.origin}</span> },
                { key: "path", header: "Chemin", render: (entry) => entry.path ? <span className="bo-ref">{entry.path}</span> : "tous chemins" },
                { key: "partner", header: "Partenaire", render: (entry) => <span className="bo-ref">{entry.partnerTenantId}</span> },
                { key: "status", header: "Statut", render: (entry) => <StatusBadge status={entry.status} tones={integrationStatusTones} /> },
                { key: "actions", header: "Actions", render: (entry) => entry.status === "active" ? <RevokeAllowlistForm entryId={entry.id} /> : "-" }
              ]}
              items={integrations.data.webhookAllowlist.items}
              getKey={(entry) => entry.id}
              emptyLabel="Aucune origine webhook autorisée."
              aria-label="Allow-list webhook"
            />
          </Card>

          <Card title="Endpoints webhook">
            <DataTable
              columns={[
                { key: "url", header: "URL", render: (endpoint) => <span className="bo-ref">{endpoint.url}</span> },
                { key: "partner", header: "Partenaire", render: (endpoint) => <span className="bo-ref">{endpoint.partnerTenantId}</span> },
                { key: "events", header: "Événements", render: (endpoint) => endpoint.eventTypes.join(", ") },
                { key: "secret", header: "Secret", render: () => <Badge tone="success">configuré</Badge> },
                { key: "status", header: "Statut", render: (endpoint) => <StatusBadge status={endpoint.status} tones={integrationStatusTones} /> },
                {
                  key: "actions",
                  header: "Actions",
                  render: (endpoint) => (
                    <>
                      <EndpointStatusForm endpointId={endpoint.id} status={endpoint.status} />
                      <TestEventForm endpointId={endpoint.id} />
                    </>
                  )
                }
              ]}
              items={integrations.data.webhookEndpoints.items}
              getKey={(endpoint) => endpoint.id}
              emptyLabel="Aucun endpoint webhook configuré."
              aria-label="Endpoints webhook"
            />
          </Card>

          <Card title="Livraisons webhook">
            <DataTable
              columns={[
                { key: "event", header: "Événement", render: (delivery) => <span className="bo-ref">{delivery.eventType}</span> },
                { key: "partner", header: "Partenaire", render: (delivery) => <span className="bo-ref">{delivery.partnerTenantId}</span> },
                { key: "status", header: "Statut", render: (delivery) => <StatusBadge status={delivery.status} tones={integrationStatusTones} /> },
                { key: "attempts", header: "Tentatives", render: (delivery) => delivery.attemptCount, numeric: true, align: "right" },
                { key: "idempotency", header: "Idempotence", render: (delivery) => <span className="bo-ref">{delivery.idempotencyKey}</span> }
              ]}
              items={integrations.data.webhookDeliveries.items}
              getKey={(delivery) => delivery.id}
              emptyLabel="Aucune livraison webhook journalisée."
              aria-label="Livraisons webhook"
            />
          </Card>
        </>
      ) : null}
    </PageStack>
  );
}
