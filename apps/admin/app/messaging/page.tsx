import { readMessagingDeliveries, readMessagingProviders } from "../lib/admin-api";
import { Badge, Card, DataTable, Notice, PageHeader, PageStack, StateMessage } from "../lib/ui/admin-ui";

export default async function AdminMessagingPage() {
  const [providers, deliveries] = await Promise.all([readMessagingProviders(), readMessagingDeliveries()]);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Partenaires" }, { label: "Messagerie" }]}
        title="Messaging SMS et WhatsApp"
        description="Etat des canaux optionnels. Un canal n'envoie que si son flag est actif, un fournisseur est configure et le destinataire a donne son accord. Aucun secret fournisseur n'est expose."
      />
      {providers.forbidden ? <StateMessage tone="danger">Acces messaging refuse pour ce role admin.</StateMessage> : null}
      {providers.status === "error" ? <StateMessage tone="danger">Messaging indisponible: {providers.error}</StateMessage> : null}

      {providers.status === "success" ? (
        <>
          {providers.data.restrictions.length > 0 ? (
            <Notice tone="neutral" title="Restrictions">
              <ul className="bo-list bo-break">
                {providers.data.restrictions.map((restriction) => <li key={restriction}>{restriction}</li>)}
              </ul>
            </Notice>
          ) : null}

          <Card title="Canaux">
            <DataTable
              columns={[
                { key: "channel", header: "Canal", render: (provider) => provider.channel },
                { key: "flagKey", header: "Flag", render: (provider) => <span className="bo-ref">{provider.flagKey}</span> },
                { key: "enabled", header: "Flag actif", render: (provider) => <Badge tone={provider.enabled ? "warning" : "disabled"}>{provider.enabled ? "oui" : "non"}</Badge> },
                { key: "provider", header: "Fournisseur", render: (provider) => provider.provider },
                { key: "secret", header: "Secret configure", render: (provider) => <Badge tone={provider.secretConfigured ? "info" : "disabled"}>{provider.secretConfigured ? "oui" : "non"}</Badge> },
                { key: "sendCapable", header: "Envoi possible", render: (provider) => <Badge tone={provider.sendCapable ? "warning" : "disabled"}>{provider.sendCapable ? "oui" : "non"}</Badge> },
                { key: "reason", header: "Motif", render: (provider) => provider.reason }
              ]}
              items={providers.data.providers}
              getKey={(provider) => provider.channel}
              emptyLabel="Aucun canal reference."
              aria-label="Canaux de messagerie"
            />
          </Card>

          <Card
            title="Dernieres tentatives de diffusion"
            description="Les destinataires sont masques et le contenu des messages n'est jamais journalise."
          >
            <DataTable
              columns={[
                { key: "channel", header: "Canal", render: (delivery) => delivery.channel },
                { key: "status", header: "Statut", render: (delivery) => <Badge tone={delivery.status === "sent" ? "info" : "warning"}>{delivery.status}</Badge> },
                { key: "template", header: "Modele", render: (delivery) => delivery.template },
                { key: "recipient", header: "Destinataire", render: (delivery) => <span className="bo-ref">{delivery.recipientMasked}</span> },
                { key: "provider", header: "Fournisseur", render: (delivery) => delivery.provider },
                { key: "reason", header: "Motif", render: (delivery) => delivery.reason ?? "-" }
              ]}
              items={deliveries.status === "success" ? deliveries.data : []}
              getKey={(delivery) => delivery.id}
              emptyLabel="Aucune tentative enregistree."
              emptyDescription="Les envois SMS et WhatsApp apparaissent ici des qu'un canal est actif et configure."
              aria-label="Tentatives de diffusion"
            />
          </Card>
        </>
      ) : null}
    </PageStack>
  );
}
