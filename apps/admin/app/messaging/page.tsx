import { readMessagingDeliveries, readMessagingProviders } from "../lib/admin-api";
import { Badge, Card, DataTable, Notice, PageHeader, PageStack, StateMessage } from "../lib/ui/admin-ui";
import { MessagingTestForm } from "./messaging-test-form";

export default async function AdminMessagingPage() {
  const [providers, deliveries] = await Promise.all([readMessagingProviders(), readMessagingDeliveries()]);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Partenaires" }, { label: "Messagerie" }]}
        title="Messaging SMS et WhatsApp"
        description="État des canaux optionnels. Un canal n'envoie que si son flag est actif, un fournisseur est configuré et le destinataire a donné son accord. Aucun secret fournisseur n'est exposé."
      />
      {providers.forbidden ? <StateMessage tone="danger">Accès messaging refusé pour ce rôle admin.</StateMessage> : null}
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
                { key: "secret", header: "Secret configuré", render: (provider) => <Badge tone={provider.secretConfigured ? "info" : "disabled"}>{provider.secretConfigured ? "oui" : "non"}</Badge> },
                { key: "sendCapable", header: "Envoi possible", render: (provider) => <Badge tone={provider.sendCapable ? "warning" : "disabled"}>{provider.sendCapable ? "oui" : "non"}</Badge> },
                { key: "reason", header: "Motif", render: (provider) => provider.reason }
              ]}
              items={providers.data.providers}
              getKey={(provider) => provider.channel}
              emptyLabel="Aucun canal référence."
              aria-label="Canaux de messagerie"
            />
          </Card>

          <Card
            title="Envoi de test"
            description="Vérifie qu'un canal configuré envoie bien un message. Un canal fermé ou sans fournisseur refuse l'envoi."
          >
            <MessagingTestForm channels={providers.data.providers.map((provider) => provider.channel)} />
          </Card>

          <Card
            title="Dernières tentatives de diffusion"
            description="Les destinataires sont masqués et le contenu des messages n'est jamais journalisé."
          >
            <DataTable
              columns={[
                { key: "channel", header: "Canal", render: (delivery) => delivery.channel },
                { key: "status", header: "Statut", render: (delivery) => <Badge tone={delivery.status === "sent" ? "info" : "warning"}>{delivery.status}</Badge> },
                { key: "template", header: "Modèle", render: (delivery) => delivery.template },
                { key: "recipient", header: "Destinataire", render: (delivery) => <span className="bo-ref">{delivery.recipientMasked}</span> },
                { key: "provider", header: "Fournisseur", render: (delivery) => delivery.provider },
                { key: "reason", header: "Motif", render: (delivery) => delivery.reason ?? "-" }
              ]}
              items={deliveries.status === "success" ? deliveries.data : []}
              getKey={(delivery) => delivery.id}
              emptyLabel="Aucune tentative enregistrée."
              emptyDescription="Les envois SMS et WhatsApp apparaissent ici dès qu'un canal est actif et configuré."
              aria-label="Tentatives de diffusion"
            />
          </Card>
        </>
      ) : null}
    </PageStack>
  );
}
