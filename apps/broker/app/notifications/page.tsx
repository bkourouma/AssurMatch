import { redirect } from "next/navigation";
import { isStarterCrmDenied, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readBrokerInbox, readBrokerNotificationPreferences } from "../lib/broker-api";
import { MESSAGING_NOTIFICATION_TYPE_LABELS, leadNotificationHref } from "../lib/conversation-vocabulary";
import { markNotificationReadAction, updateNotificationPreferencesAction } from "../lib/notification-actions";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Cluster,
  EmptyState,
  Field,
  Form,
  FormActions,
  Input,
  Notice,
  PageHeader,
  PageStack,
  Split,
  StatusBadge,
  TenantWriteGuard
} from "../lib/ui/broker-ui";
import styles from "../lib/ui/broker-screens.module.css";
import { TENANT_SUSPENDED_MESSAGE, isTenantReadOnly } from "../lib/broker-permissions";

const NOTICES: Record<string, string> = {
  read: "Notification marquee comme lue.",
  preferences_saved: "Preferences de canaux enregistrees et auditees.",
  baseline: "Email et notifications in-app restent actifs: ce sont les canaux operationnels de base.",
  forbidden: "Action refusee par vos permissions.",
  // Spec 051 FR-021: 403 PARTNER_SUSPENDED (marking a notification read stays allowed).
  suspended: TENANT_SUSPENDED_MESSAGE,
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
          title="Acces refuse"
          description="Les notifications exigent une session courtier authentifiee et la MFA verifiee."
        />
      </PageStack>
    );
  }

  const [inbox, preferences] = await Promise.all([readBrokerInbox(), readBrokerNotificationPreferences()]);
  const unreadCount = inbox.status === "success" ? inbox.data.filter((notification) => !notification.read).length : 0;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={BREADCRUMB}
        title="Notifications operationnelles"
        description="Messages operationnels sur vos leads et votre compte. Aucun engagement contractuel, aucun contenu promotionnel."
      />
      {notif && NOTICES[notif] ? (
        <Notice tone={notif === "read" || notif === "preferences_saved" ? "success" : "warning"}>{NOTICES[notif]}</Notice>
      ) : null}

      <Split>
        <Card
          title="Boite de reception"
          actions={unreadCount > 0 ? <Badge tone="info">{`${unreadCount} non lue(s)`}</Badge> : undefined}
        >
          {inbox.status !== "success" ? (
            <Notice tone="warning">Notifications temporairement indisponibles. Rechargez la page dans quelques instants.</Notice>
          ) : inbox.data.length === 0 ? (
            <EmptyState
              icon="bell"
              title="Aucune notification pour votre cabinet."
              description="Les nouveaux leads assignes et les evenements de votre compte apparaissent ici."
            />
          ) : (
            <ul className="bo-list">
              {inbox.data.map((notification) => (
                <li key={notification.id} className={styles.entry}>
                  <div className={styles.entryHead}>
                    <h3 className={styles.entryTitle}>{notification.title}</h3>
                    <StatusBadge status={notification.read ? "read" : "unread"} labels={READ_LABELS} tones={READ_TONES} />
                    <span className={`${styles.entryMeta} bo-ref`}>{new Date(notification.createdAt).toISOString().slice(0, 16).replace("T", " ")}</span>
                  </div>
                  <p className={styles.message}>{notification.body}</p>
                  <Cluster>
                    {MESSAGING_NOTIFICATION_TYPE_LABELS[notification.type] ? <Badge tone="info">{MESSAGING_NOTIFICATION_TYPE_LABELS[notification.type]}</Badge> : null}
                    {notification.targetType === "LeadAssignment" && notification.targetId ? (
                      <Button href={leadNotificationHref(notification.type, notification.targetId, isStarterCrmDenied(session.profile))} variant="secondary" size="sm">
                        {MESSAGING_NOTIFICATION_TYPE_LABELS[notification.type] ? "Ouvrir la conversation" : "Ouvrir le lead"}
                      </Button>
                    ) : null}
                    {notification.read ? null : (
                      <form action={markNotificationReadAction}>
                        <input type="hidden" name="notificationId" value={notification.id} />
                        <Button type="submit" variant="tertiary" size="sm">Marquer comme lue</Button>
                      </form>
                    )}
                  </Cluster>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Canaux de notification"
          description="Email et notifications in-app restent actifs en permanence. SMS et WhatsApp ne sont utilises que si la plateforme les a actives et si vous les acceptez ici."
        >
          {preferences.status === "success" ? (
            <TenantWriteGuard readOnly={isTenantReadOnly(session.profile)}>
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
                <Button type="submit">Enregistrer mes canaux</Button>
              </FormActions>
            </Form>
            </TenantWriteGuard>
          ) : (
            <Notice tone="warning">Preferences indisponibles: {preferences.error ?? "erreur inconnue"}.</Notice>
          )}
        </Card>
      </Split>
    </PageStack>
  );
}
