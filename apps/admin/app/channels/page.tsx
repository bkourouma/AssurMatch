import { redirect } from "next/navigation";
import { readChannelOutbox, readMessagingDeliveries, readMessagingProviders } from "../lib/channels-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { Badge, Button, Card, Cluster, DataTable, Notice, PageHeader, PageStack, StateMessage, StatStrip, StatusBadge, type Tone } from "../lib/ui/admin-ui";
import { readFailureDetail } from "../lib/auth-error-messages";

const PAGE_PATH = "/channels";
const SAMPLE_NOTE = "50 dernières lignes";
const ACCESS_DENIED = "Accès refusé pour ce rôle admin (journal d'audit en lecture requis).";

const OUTBOX_STATUSES = ["retryable", "dead_letter", "failed", "sent", "cancelled"] as const;

const OUTBOX_LABELS: Record<string, string> = {
  retryable: "À reprendre",
  dead_letter: "Échec définitif",
  failed: "Échec",
  sent: "Envoyé",
  cancelled: "Annulé"
};

const OUTBOX_TONES: Record<string, Tone> = {
  dead_letter: "danger",
  failed: "danger",
  retryable: "warning",
  sent: "success",
  cancelled: "disabled"
};

const DELIVERY_TONES: Record<string, Tone> = { sent: "success", refused: "warning", failed: "danger" };
const DELIVERY_LABELS: Record<string, string> = { sent: "Envoyé", refused: "Refusé", failed: "Échec" };

const CHANNEL_LABELS: Record<string, string> = { sms: "SMS", whatsapp: "WhatsApp" };

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 16).replace("T", " ");
}

function YesNo({ value }: { value: boolean }) {
  return <Badge tone={value ? "success" : "disabled"}>{value ? "Oui" : "Non"}</Badge>;
}

export default async function ChannelsPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(PAGE_PATH, session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent(PAGE_PATH)}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect(`/login?error=access_denied&returnTo=${encodeURIComponent(PAGE_PATH)}`);

  const [outbox, providers, deliveries] = await Promise.all([readChannelOutbox(), readMessagingProviders(), readMessagingDeliveries()]);
  if (outbox.status === "unauthenticated") redirect(loginRedirect(PAGE_PATH, outbox.error ?? "session_required"));

  const counts = OUTBOX_STATUSES.map((status) => ({ status, count: outbox.data.filter((item) => item.status === status).length }));
  const deadLetterCount = counts.find((entry) => entry.status === "dead_letter")?.count ?? 0;
  const retryableCount = counts.find((entry) => entry.status === "retryable")?.count ?? 0;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Partenaires" }, { label: "Canaux" }]}
        kicker="Messagerie sortante"
        title="Canaux SMS et WhatsApp"
        description="File de reprise des envois SMS et WhatsApp. Cet écran est en lecture seule et n'affiche jamais de numéro de téléphone ni de corps de message."
        actions={
          <Cluster>
            <Button href="/messaging" variant="secondary">Ouvrir la messagerie</Button>
            <Button href="/connecteurs-crm" variant="secondary">Connecteurs CRM</Button>
          </Cluster>
        }
      />

      {outbox.status === "forbidden" ? <StateMessage tone="danger">{ACCESS_DENIED}</StateMessage> : null}
      {outbox.status === "error" ? <StateMessage tone="danger">File de reprise indisponible. {readFailureDetail(outbox.error)}</StateMessage> : null}

      {outbox.status === "success" ? (
        <>
          {deadLetterCount > 0 ? (
            <Notice tone="danger" title="Envois en échec définitif">
              {`${deadLetterCount} envoi(s) ne seront plus repris automatiquement. `}
              <a href="/dashboard/compliance-alerts">Consulter les alertes</a>
            </Notice>
          ) : retryableCount > 0 ? (
            <Notice tone="warning">{`${retryableCount} envoi(s) en attente de reprise : le worker les rejoue selon la règle ci-dessous.`}</Notice>
          ) : (
            <Notice tone="success">Aucun envoi en échec ni en attente de reprise dans l&apos;échantillon.</Notice>
          )}
          <StatStrip
            label="Synthèse de la file de reprise"
            items={counts.map(({ status, count }) => ({ label: `${OUTBOX_LABELS[status]} (${SAMPLE_NOTE})`, value: count, tone: OUTBOX_TONES[status] ?? "neutral" }))}
          />

          <Card title="File de reprise" description={`Calcul sur les ${SAMPLE_NOTE} reçues. Le partenaire est une référence opaque.`}>
            <DataTable
              columns={[
                { key: "channel", header: "Canal", render: (item) => CHANNEL_LABELS[item.channel] ?? item.channel },
                { key: "status", header: "Statut", render: (item) => <StatusBadge status={item.status} labels={OUTBOX_LABELS} tones={OUTBOX_TONES} /> },
                { key: "template", header: "Modèle", render: (item) => <code>{item.template}</code> },
                { key: "partner", header: "Partenaire (référence)", render: (item) => item.partnerTenantId ?? "-" },
                { key: "attempts", header: "Tentatives", render: (item) => item.attemptCount },
                { key: "next", header: "Prochaine tentative", render: (item) => formatDate(item.nextAttemptAt) },
                { key: "error", header: "Dernière classe d'erreur", render: (item) => item.lastErrorClass ?? "-" },
                { key: "created", header: "Création", render: (item) => formatDate(item.createdAt) }
              ]}
              items={outbox.data}
              getKey={(item) => item.id}
              emptyLabel="Aucun envoi dans la file de reprise."
              emptyDescription="Les envois SMS et WhatsApp apparaissent ici dès qu'un message est mis en file. Pour vérifier la chaîne, faites un envoi de test."
              emptyAction={<Button href="/messaging" variant="secondary">Ouvrir la messagerie</Button>}
              aria-label="File de reprise SMS et WhatsApp"
            />
          </Card>
        </>
      ) : null}

      <Card title="Règle de reprise" description="Comportement appliqué par le worker de messagerie.">
        <ul className="bo-list">
          <li>4 tentatives au maximum, avec des délais de 1, 5 puis 30 minutes entre les reprises.</li>
          <li>Après la dernière tentative, la ligne passe en dead_letter et une alerte admin « Message SMS/WhatsApp en échec définitif » est créée dans le centre d'alertes (<a href="/dashboard/compliance-alerts">Alertes</a>).</li>
          <li>Les numéros et les corps de message ne sont jamais exposés sur cet écran.</li>
        </ul>
      </Card>

      <Card title="État des canaux" description="Lecture seule : l'activation d'un canal passe par la commande d'exploitation, avec référence de politique et approbateur.">
        {providers.status === "forbidden" ? <StateMessage tone="danger">{ACCESS_DENIED}</StateMessage> : null}
        {providers.status === "error" ? <StateMessage tone="danger">État des canaux indisponible. {readFailureDetail(providers.error)}</StateMessage> : null}
        {providers.status === "success" ? (
          <DataTable
            columns={[
              { key: "channel", header: "Canal", render: (provider) => CHANNEL_LABELS[provider.channel] ?? provider.channel },
              { key: "flag", header: "Flag", render: (provider) => <><code>{provider.flagKey}</code> <YesNo value={provider.enabled} /></> },
              { key: "provider", header: "Fournisseur configuré", render: (provider) => <>{provider.provider} <YesNo value={provider.configured} /></> },
              { key: "send", header: "Envoi possible", render: (provider) => <YesNo value={provider.sendCapable} /> },
              { key: "reason", header: "Motif", render: (provider) => provider.reason }
            ]}
            items={providers.data.providers}
            getKey={(provider) => provider.channel}
            emptyLabel="Aucun canal référencé."
            emptyDescription="Aucun fournisseur SMS ou WhatsApp n'est déclaré côté plateforme."
            aria-label="État des canaux SMS et WhatsApp"
          />
        ) : null}
        <p className="bo-description">Commande d'exploitation (activation de sms_enabled ou whatsapp_enabled) :</p>
        <pre><code>npm run ops:apply-flag-policy -- --flag sms_enabled --value true --reference ... --approved-by ... --reason ...</code></pre>
      </Card>

      <Card title="Dernières diffusions (destinataire masqué)" description="Journal des envois SMS et WhatsApp, destinataire masqué.">
        {deliveries.status === "forbidden" ? <StateMessage tone="danger">{ACCESS_DENIED}</StateMessage> : null}
        {deliveries.status === "error" ? <StateMessage tone="danger">Diffusions indisponibles. {readFailureDetail(deliveries.error)}</StateMessage> : null}
        {deliveries.status === "success" ? (
          <DataTable
            columns={[
              { key: "channel", header: "Canal", render: (row) => CHANNEL_LABELS[row.channel] ?? row.channel },
              { key: "status", header: "Statut", render: (row) => <StatusBadge status={row.status} labels={DELIVERY_LABELS} tones={DELIVERY_TONES} /> },
              { key: "template", header: "Modèle", render: (row) => <code>{row.template}</code> },
              { key: "recipient", header: "Destinataire masqué", render: (row) => row.recipientMasked },
              { key: "provider", header: "Fournisseur", render: (row) => row.provider },
              { key: "reason", header: "Motif", render: (row) => row.reason ?? "-" },
              { key: "created", header: "Date", render: (row) => formatDate(row.createdAt) }
            ]}
            items={deliveries.data}
            getKey={(row) => row.id}
            emptyLabel="Aucune diffusion enregistrée."
            emptyDescription="Le journal se remplit après le premier envoi réel ou de test."
            aria-label="Dernières diffusions SMS et WhatsApp"
          />
        ) : null}
      </Card>

      <Card title="Liens utiles">
        <ul className="bo-list">
          <li><a href="/messaging">Messagerie : envoi de test</a></li>
          <li><a href="/connecteurs-crm">Connecteurs CRM</a></li>
        </ul>
      </Card>
    </PageStack>
  );
}
