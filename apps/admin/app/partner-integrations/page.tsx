import { readPartnerIntegrations } from "../lib/admin-api";
import {
  Badge,
  Card,
  Cluster,
  DataTable,
  Grid,
  KpiCard,
  PageHeader,
  PageStack,
  StateMessage,
  StatusBadge,
  integrationStatusTones
} from "../lib/ui/admin-ui";

export default async function PartnerIntegrationsPage() {
  const integrations = await readPartnerIntegrations();

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Partenaires" }, { label: "Integrations" }]}
        kicker="Integrations partenaires"
        title="Partner API et webhooks"
        description="Surface admin lecture seule des cles API hachees, endpoints webhook desactives par defaut et journaux de livraison metadata-only."
      />

      {integrations.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {integrations.forbidden ? <StateMessage tone="danger">Acces integrations refuse pour ce role admin.</StateMessage> : null}
      {integrations.status === "error" ? <StateMessage tone="danger">Integrations indisponibles: {integrations.error}</StateMessage> : null}

      {integrations.status === "success" ? (
        <>
          <Grid columns="kpi" as="section" aria-label="Synthese integrations partenaires">
            <KpiCard label="Cles API" value={integrations.data.apiKeys.total} />
            <KpiCard label="Endpoints webhook" value={integrations.data.webhookEndpoints.total} tone="info" />
            <KpiCard label="Origines autorisees" value={integrations.data.webhookAllowlist.total} tone="success" />
            <KpiCard label="Livraisons journalisees" value={integrations.data.webhookDeliveries.total} tone="warning" />
          </Grid>

          <Grid columns="two">
            <Card title="Garde-fous actifs">
              <Cluster>
                <Badge tone="disabled">partner_api_enabled: desactive par defaut</Badge>
                <Badge tone="disabled">partner_webhooks_enabled: desactive par defaut</Badge>
                <Badge tone="success">cles hachees Argon2</Badge>
                <Badge tone="success">secrets webhook chiffres</Badge>
                <Badge tone="success">allow-list tenant obligatoire</Badge>
                <Badge tone="disabled">redirects HTTP bloques</Badge>
              </Cluster>
            </Card>
            <Card title="Evenements autorises">
              <ul className="bo-list">
                <li>lead.assigned</li>
                <li>lead.status_changed</li>
                <li>notification.failed</li>
              </ul>
            </Card>
          </Grid>

          <Card title="Cles API">
            <DataTable
              columns={[
                { key: "name", header: "Nom", render: (key) => <strong>{key.name}</strong> },
                { key: "partner", header: "Partenaire", render: (key) => <code>{key.partnerTenantId}</code> },
                { key: "prefix", header: "Prefixe", render: (key) => <code>{key.keyPrefix}</code> },
                { key: "scopes", header: "Scopes", render: (key) => key.scopes.join(", ") },
                { key: "status", header: "Statut", render: (key) => <StatusBadge status={key.status} tones={integrationStatusTones} /> }
              ]}
              items={integrations.data.apiKeys.items}
              getKey={(key) => key.id}
              emptyLabel="Aucune cle API partenaire configuree."
              aria-label="Cles API partenaires"
            />
          </Card>

          <Card title="Allow-list webhook">
            <DataTable
              columns={[
                { key: "origin", header: "Origine", render: (entry) => <code>{entry.origin}</code> },
                { key: "path", header: "Chemin", render: (entry) => entry.path ? <code>{entry.path}</code> : "tous chemins" },
                { key: "partner", header: "Partenaire", render: (entry) => <code>{entry.partnerTenantId}</code> },
                { key: "status", header: "Statut", render: (entry) => <StatusBadge status={entry.status} tones={integrationStatusTones} /> }
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
                { key: "url", header: "URL", render: (endpoint) => <code>{endpoint.url}</code> },
                { key: "partner", header: "Partenaire", render: (endpoint) => <code>{endpoint.partnerTenantId}</code> },
                { key: "events", header: "Evenements", render: (endpoint) => endpoint.eventTypes.join(", ") },
                { key: "secret", header: "Secret", render: () => <Badge tone="success">configure</Badge> },
                { key: "status", header: "Statut", render: (endpoint) => <StatusBadge status={endpoint.status} tones={integrationStatusTones} /> }
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
                { key: "event", header: "Evenement", render: (delivery) => <code>{delivery.eventType}</code> },
                { key: "partner", header: "Partenaire", render: (delivery) => <code>{delivery.partnerTenantId}</code> },
                { key: "status", header: "Statut", render: (delivery) => <StatusBadge status={delivery.status} tones={integrationStatusTones} /> },
                { key: "attempts", header: "Tentatives", render: (delivery) => delivery.attemptCount, numeric: true, align: "right" },
                { key: "idempotency", header: "Idempotence", render: (delivery) => <code>{delivery.idempotencyKey}</code> }
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
