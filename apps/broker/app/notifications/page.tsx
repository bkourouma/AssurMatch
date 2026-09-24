import { redirect } from "next/navigation";
import { loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readBrokerInbox, readBrokerNotificationPreferences } from "../lib/broker-api";
import { markNotificationReadAction, updateNotificationPreferencesAction } from "../lib/notification-actions";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Cluster,
  Field,
  Form,
  FormActions,
  Input,
  Notice,
  PageHeader,
  PageStack,
  Stack,
  StatusBadge
} from "../lib/ui/broker-ui";

const NOTICES: Record<string, string> = {
  read: "Notification marquee comme lue.",
  preferences_saved: "Preferences de canaux enregistrees et auditees.",
  baseline: "Email et notifications in-app restent actifs: ce sont les canaux operationnels de base.",
  forbidden: "Action refusee par vos permissions.",
  error: "Notifications temporairement indisponibles."
};

/** Le vocabulaire de lecture reste celui de l'ecran: le composant partage n'invente aucun libelle. */
const READ_LABELS = { read: "lue", unread: "non lue" };
const READ_TONES = { read: "neutral", unread: "info" } as const;

const BREADCRUMB = [{ label: "Compte" }, { label: "Notifications" }];

export default async function BrokerNotificationsPage({ searchParams }: { searchParams: Promise<{ notif?: string }> }) {
  const { notif } = await searchParams;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/notifications", session.status));
  if (session.status !== "authenticated") {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={BREADCRUMB}
          kicker="Notifications"
          title="Acces refuse"
          description="Les notifications exigent une session courtier authentifiee et la MFA verifiee."
        />
      </PageStack>
    );
  }

  const [inbox, preferences] = await Promise.all([readBrokerInbox(), readBrokerNotificationPreferences()]);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={BREADCRUMB}
        kicker="Notifications"
        title="Notifications operationnelles"
        description="Messages operationnels sur vos leads et votre compte. Aucun engagement contractuel, aucun contenu promotionnel."
      />
      {notif && NOTICES[notif] ? (
        <Notice tone={notif === "read" || notif === "preferences_saved" ? "success" : "warning"}>{NOTICES[notif]}</Notice>
      ) : null}

      <Card title="Boite de reception">
        {inbox.status !== "success" || inbox.data.length === 0 ? (
          <p>Aucune notification pour votre cabinet.</p>
        ) : (
          <Stack>
            {inbox.data.map((notification) => (
              <Card key={notification.id} muted>
                <Cluster>
                  <strong>{notification.title}</strong>
                  <StatusBadge status={notification.read ? "read" : "unread"} labels={READ_LABELS} tones={READ_TONES} />
                  <span>{new Date(notification.createdAt).toISOString().slice(0, 16).replace("T", " ")}</span>
                </Cluster>
                <p>{notification.body}</p>
                <Cluster>
                  {notification.targetType === "LeadAssignment" && notification.targetId ? (
                    <Button href={`/crm/leads/${notification.targetId}`} variant="tertiary" size="sm">Ouvrir le lead</Button>
                  ) : null}
                  {notification.read ? null : (
                    <form action={markNotificationReadAction}>
                      <input type="hidden" name="notificationId" value={notification.id} />
                      <Button type="submit" variant="secondary" size="sm">Marquer comme lue</Button>
                    </form>
                  )}
                </Cluster>
              </Card>
            ))}
          </Stack>
        )}
      </Card>

      <Card title="Canaux de notification">
        <p>
          Email et notifications in-app restent actifs en permanence. SMS et WhatsApp ne sont utilises que si la plateforme les a actives et si vous les acceptez ici.
        </p>
        {preferences.status === "success" ? (
          <Form action={updateNotificationPreferencesAction}>
            <Cluster>
              <Badge tone="info">email: toujours actif</Badge>
              <Badge tone="info">in-app: toujours actif</Badge>
            </Cluster>
            <Checkbox id="notif-sms" name="sms" label="Accepter les notifications SMS" defaultChecked={preferences.data.sms} />
            <Checkbox id="notif-whatsapp" name="whatsapp" label="Accepter les notifications WhatsApp" defaultChecked={preferences.data.whatsapp} />
            <Field id="notif-reason" label="Motif">
              <Input id="notif-reason" name="reason" placeholder="Motif de la mise a jour" />
            </Field>
            <FormActions>
              <Button type="submit" variant="secondary">Enregistrer mes canaux</Button>
            </FormActions>
          </Form>
        ) : (
          <Notice tone="warning">Preferences indisponibles: {preferences.error ?? "erreur inconnue"}.</Notice>
        )}
      </Card>
    </PageStack>
  );
}
