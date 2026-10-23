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
        breadcrumb={[{ label: "Partenaires" }, { label: "Integrations" }]}
        title="Partner API et webhooks"
        description="Gestion des cles API hachees, des endpoints webhook (desactives par defaut, flags partner_api_enabled et partner_webhooks_enabled fermes par defaut) et journaux de livraison metadata-only. Chaque action exige un motif audite."
      />

      {integrations.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {integrations.forbidden ? <StateMessage tone="danger">Acces integrations refuse pour ce role admin.</StateMessage> : null}
      {integrations.status === "error" ? <StateMessage tone="danger">Integrations indisponibles: {integrations.error}</StateMessage> : null}

      {integrations.status === "success" ? (
        <>
          <StatStrip
            label="Synthese integrations partenaires"
            items={[
              { label: "Cles API", value: integrations.data.apiKeys.total },
              { label: "Endpoints webhook", value: integrations.data.webhookEndpoints.total },
              { label: "Origines autorisees", value: integrations.data.webhookAllowlist.total },
              { label: "Livraisons journalisees", value: integrations.data.webhookDeliveries.total }
            ]}
          />

          <Card title="Garde-fous actifs">
            <Stack>
              <Cluster>
                <Badge tone="disabled">partner_api_enabled: desactive par defaut</Badge>
                <Badge tone="disabled">partner_webhooks_enabled: desactive par defaut</Badge>
                <Badge tone="success">cles hachees Argon2</Badge>
                <Badge tone="success">secrets webhook chiffres</Badge>
                <Badge tone="success">allow-list tenant obligatoire</Badge>
                <Badge tone="disabled">redirects HTTP bloques</Badge>
              </Cluster>
              <p>
                Evenements autorises : <span className="bo-ref">lead.assigned</span>, <span className="bo-ref">lead.status_changed</span>,{" "}
                <span className="bo-ref">notification.failed</span>.
              </p>
            </Stack>
          </Card>

          {partners.length === 0 ? <StateMessage tone="warning">Liste des partenaires indisponible : creation impossible pour le moment.</StateMessage> : null}

          <Grid columns="two">
            <Card title="Creer une cle API">
              <CreateApiKeyForm partners={partners} />
            </Card>
            <Card title="Creer un endpoint webhook">
              <CreateWebhookEndpointForm partners={partners} />
            </Card>
          </Grid>

          <Card title="Cles API">
            <DataTable
              columns={[
                { key: "name", header: "Nom", render: (key) => <strong>{key.name}</strong> },
                { key: "partner", header: "Partenaire", render: (key) => <span className="bo-ref">{key.partnerTenantId}</span> },
                { key: "prefix", header: "Prefixe", render: (key) => <span className="bo-ref">{key.keyPrefix}</span> },
                { key: "scopes", header: "Scopes", render: (key) => key.scopes.join(", ") },
                { key: "status", header: "Statut", render: (key) => <StatusBadge status={key.status} tones={integrationStatusTones} /> },
                { key: "actions", header: "Actions", render: (key) => key.status === "active" ? <RevokeApiKeyForm keyId={key.id} /> : "-" }
              ]}
              items={integrations.data.apiKeys.items}
              getKey={(key) => key.id}
              emptyLabel="Aucune cle API partenaire configuree."
              aria-label="Cles API partenaires"
            />
          </Card>

          <Card title="Ajouter une origine autorisee">
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
              emptyLabel="Aucune origine webhook autorisee."
              aria-label="Allow-list webhook"
            />
          </Card>

          <Card title="Endpoints webhook">
            <DataTable
              columns={[
                { key: "url", header: "URL", render: (endpoint) => <span className="bo-ref">{endpoint.url}</span> },
                { key: "partner", header: "Partenaire", render: (endpoint) => <span className="bo-ref">{endpoint.partnerTenantId}</span> },
                { key: "events", header: "Evenements", render: (endpoint) => endpoint.eventTypes.join(", ") },
                { key: "secret", header: "Secret", render: () => <Badge tone="success">configure</Badge> },
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
              emptyLabel="Aucun endpoint webhook configure."
              aria-label="Endpoints webhook"
            />
          </Card>

          <Card title="Livraisons webhook">
            <DataTable
              columns={[
                { key: "event", header: "Evenement", render: (delivery) => <span className="bo-ref">{delivery.eventType}</span> },
                { key: "partner", header: "Partenaire", render: (delivery) => <span className="bo-ref">{delivery.partnerTenantId}</span> },
                { key: "status", header: "Statut", render: (delivery) => <StatusBadge status={delivery.status} tones={integrationStatusTones} /> },
                { key: "attempts", header: "Tentatives", render: (delivery) => delivery.attemptCount, numeric: true, align: "right" },
                { key: "idempotency", header: "Idempotence", render: (delivery) => <span className="bo-ref">{delivery.idempotencyKey}</span> }
              ]}
              items={integrations.data.webhookDeliveries.items}
              getKey={(delivery) => delivery.id}
              emptyLabel="Aucune livraison webhook journalisee."
              aria-label="Livraisons webhook"
            />
          </Card>
        </>
      ) : null}
    </PageStack>
  );
}
