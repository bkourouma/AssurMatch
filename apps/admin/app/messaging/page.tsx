import { readMessagingDeliveries, readMessagingProviders } from "../lib/admin-api";
import { Badge, Card, DataTable, PageHeader, StateMessage } from "../lib/ui/admin-ui";

export default async function AdminMessagingPage() {
  const [providers, deliveries] = await Promise.all([readMessagingProviders(), readMessagingDeliveries()]);

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Canaux operationnels"
        title="Messaging SMS et WhatsApp"
        description="Etat des canaux optionnels. Un canal n'envoie que si son flag est actif, un fournisseur est configure et le destinataire a donne son accord. Aucun secret fournisseur n'est expose."
      />
      {providers.forbidden ? <StateMessage tone="danger">Acces messaging refuse pour ce role admin.</StateMessage> : null}
      {providers.status === "error" ? <StateMessage tone="danger">Messaging indisponible: {providers.error}</StateMessage> : null}

      {providers.status === "success" ? (
        <>
          <Card>
            <DataTable
              columns={[
                { header: "Canal", render: (provider) => provider.channel },
                { header: "Flag", render: (provider) => <code>{provider.flagKey}</code> },
                { header: "Flag actif", render: (provider) => <Badge tone={provider.enabled ? "warning" : "disabled"}>{String(provider.enabled)}</Badge> },
                { header: "Fournisseur", render: (provider) => provider.provider },
                { header: "Secret configure", render: (provider) => <Badge tone={provider.secretConfigured ? "info" : "disabled"}>{String(provider.secretConfigured)}</Badge> },
                { header: "Envoi possible", render: (provider) => <Badge tone={provider.sendCapable ? "warning" : "disabled"}>{String(provider.sendCapable)}</Badge> },
                { header: "Motif", render: (provider) => provider.reason }
              ]}
              items={providers.data.providers}
              getKey={(provider) => provider.channel}
              emptyLabel="Aucun canal reference."
            />
          </Card>

          <Card>
            <h2 className="section-title">Restrictions</h2>
            <ul className="simple-list">
              {providers.data.restrictions.map((restriction) => <li key={restriction}>{restriction}</li>)}
            </ul>
          </Card>

          <Card>
            <h2 className="section-title">Dernieres tentatives de diffusion</h2>
            <p className="page-description">
              Les destinataires sont masques et le contenu des messages n'est jamais journalise.
            </p>
            <DataTable
              columns={[
                { header: "Canal", render: (delivery) => delivery.channel },
                { header: "Statut", render: (delivery) => <Badge tone={delivery.status === "sent" ? "info" : "warning"}>{delivery.status}</Badge> },
                { header: "Modele", render: (delivery) => delivery.template },
                { header: "Destinataire", render: (delivery) => <code>{delivery.recipientMasked}</code> },
                { header: "Fournisseur", render: (delivery) => delivery.provider },
                { header: "Motif", render: (delivery) => delivery.reason ?? "-" }
              ]}
              items={deliveries.status === "success" ? deliveries.data : []}
              getKey={(delivery) => delivery.id}
              emptyLabel="Aucune tentative enregistree."
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}
