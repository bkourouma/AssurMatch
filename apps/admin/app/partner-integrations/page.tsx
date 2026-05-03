import { readPartnerIntegrations } from "../lib/admin-api";
import { Badge, Card, DataTable, KpiCard, PageHeader, StateMessage } from "../lib/ui/admin-ui";

function statusTone(status: string) {
  if (status === "active" || status === "delivered") return "success";
  if (status === "pending" || status === "retryable") return "warning";
  if (status === "dead_letter" || status === "failed") return "danger";
  return "disabled";
}

export default async function PartnerIntegrationsPage() {
  const integrations = await readPartnerIntegrations();

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Integrations partenaires"
        title="Partner API et webhooks"
        description="Surface admin lecture seule des cles API hachees, endpoints webhook desactives par defaut et journaux de livraison metadata-only."
      />

      {integrations.unauthenticated ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {integrations.forbidden ? <StateMessage tone="danger">Acces integrations refuse pour ce role admin.</StateMessage> : null}
      {integrations.status === "error" ? <StateMessage tone="danger">Integrations indisponibles: {integrations.error}</StateMessage> : null}

      {integrations.status === "success" ? (
        <>
          <section className="admin-grid admin-grid--kpi" aria-label="Synthese integrations partenaires">
            <KpiCard label="Cles API" value={integrations.data.apiKeys.total} />
            <KpiCard label="Endpoints webhook" value={integrations.data.webhookEndpoints.total} tone="info" />
            <KpiCard label="Origines autorisees" value={integrations.data.webhookAllowlist.total} tone="success" />
            <KpiCard label="Livraisons journalisees" value={integrations.data.webhookDeliveries.total} tone="warning" />
          </section>

          <section className="admin-grid admin-grid--two">
            <Card>
              <h2 className="section-title">Garde-fous actifs</h2>
              <div className="admin-grid">
                <Badge tone="disabled">partner_api_enabled: desactive par defaut</Badge>
                <Badge tone="disabled">partner_webhooks_enabled: desactive par defaut</Badge>
                <Badge tone="success">cles hachees Argon2</Badge>
                <Badge tone="success">secrets webhook chiffres</Badge>
                <Badge tone="success">allow-list tenant obligatoire</Badge>
                <Badge tone="disabled">redirects HTTP bloques</Badge>
              </div>
            </Card>
            <Card>
              <h2 className="section-title">Evenements autorises</h2>
              <ul className="simple-list">
                <li>lead.assigned</li>
                <li>lead.status_changed</li>
                <li>notification.failed</li>
              </ul>
            </Card>
          </section>

          <Card>
            <h2 className="section-title">Cles API</h2>
            <DataTable
              columns={[
                { header: "Nom", render: (key) => <strong>{key.name}</strong> },
                { header: "Partenaire", render: (key) => <code>{key.partnerTenantId}</code> },
                { header: "Prefixe", render: (key) => <code>{key.keyPrefix}</code> },
                { header: "Scopes", render: (key) => key.scopes.join(", ") },
                { header: "Statut", render: (key) => <Badge tone={statusTone(key.status)}>{key.status}</Badge> }
              ]}
              items={integrations.data.apiKeys.items}
              getKey={(key) => key.id}
              emptyLabel="Aucune cle API partenaire configuree."
            />
          </Card>

          <Card>
            <h2 className="section-title">Allow-list webhook</h2>
            <DataTable
              columns={[
                { header: "Origine", render: (entry) => <code>{entry.origin}</code> },
                { header: "Chemin", render: (entry) => entry.path ? <code>{entry.path}</code> : "tous chemins" },
                { header: "Partenaire", render: (entry) => <code>{entry.partnerTenantId}</code> },
                { header: "Statut", render: (entry) => <Badge tone={statusTone(entry.status)}>{entry.status}</Badge> }
              ]}
              items={integrations.data.webhookAllowlist.items}
              getKey={(entry) => entry.id}
              emptyLabel="Aucune origine webhook autorisee."
            />
          </Card>

          <Card>
            <h2 className="section-title">Endpoints webhook</h2>
            <DataTable
              columns={[
                { header: "URL", render: (endpoint) => <code>{endpoint.url}</code> },
                { header: "Partenaire", render: (endpoint) => <code>{endpoint.partnerTenantId}</code> },
                { header: "Evenements", render: (endpoint) => endpoint.eventTypes.join(", ") },
                { header: "Secret", render: () => <Badge tone="success">configure</Badge> },
                { header: "Statut", render: (endpoint) => <Badge tone={statusTone(endpoint.status)}>{endpoint.status}</Badge> }
              ]}
              items={integrations.data.webhookEndpoints.items}
              getKey={(endpoint) => endpoint.id}
              emptyLabel="Aucun endpoint webhook configure."
            />
          </Card>

          <Card>
            <h2 className="section-title">Livraisons webhook</h2>
            <DataTable
              columns={[
                { header: "Evenement", render: (delivery) => <code>{delivery.eventType}</code> },
                { header: "Partenaire", render: (delivery) => <code>{delivery.partnerTenantId}</code> },
                { header: "Statut", render: (delivery) => <Badge tone={statusTone(delivery.status)}>{delivery.status}</Badge> },
                { header: "Tentatives", render: (delivery) => delivery.attemptCount },
                { header: "Idempotence", render: (delivery) => <code>{delivery.idempotencyKey}</code> }
              ]}
              items={integrations.data.webhookDeliveries.items}
              getKey={(delivery) => delivery.id}
              emptyLabel="Aucune livraison webhook journalisee."
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}
