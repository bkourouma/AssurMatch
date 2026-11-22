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
  TenantWriteGuard,
  fieldControlProps
} from "../lib/ui/broker-ui";
import styles from "../lib/ui/broker-screens.module.css";
import polish from "../lib/ui/self-service-polish.module.css";
import { TENANT_SUSPENDED_MESSAGE, isTenantReadOnly } from "../lib/broker-permissions";

const NOTICES: Record<string, string> = {
  read: "Notification marquée comme lue.",
  preferences_saved: "Préférences de canaux enregistrées et auditées.",
  baseline: "Email et notifications in-app restent actifs: ce sont les canaux opérationnels de base.",
  forbidden: "Action refusée par vos permissions.",
  // Spec 051 FR-021: 403 PARTNER_SUSPENDED (marking a notification read stays allowed).
  suspended: TENANT_SUSPENDED_MESSAGE,
  error: "Notifications temporairement indisponibles."
};

/** Le vocabulaire de lecture reste celui de l'ecran: le composant partage n'invente aucun libelle. */
const READ_LABELS = { read: "lue", unread: "non lue" };
const READ_TONES = { read: "neutral", unread: "info" } as const;

export const metadata = { title: "Notifications" };

const BREADCRUMB = [{ label: "Compte" }, { label: "Notifications" }];

// Africa/Abidjan is UTC+0, the platform reference zone: same text on server and client.
const notificationDateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Abidjan" });

function formatNotificationDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : notificationDateFormat.format(date);
}

export default async function BrokerNotificationsPage({ searchParams }: { searchParams: Promise<{ notif?: string }> }) {
  const { notif } = await searchParams;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/notifications", session.status));
  if (session.status !== "authenticated") {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={BREADCRUMB}
          title="Accès refusé"
          description="Les notifications exigent une session courtier authentifiée et la MFA vérifiée."
          actions={
            session.status === "mfa_required" ? (
              <Button href={`/mfa?returnTo=${encodeURIComponent("/notifications")}`}>Saisir mon code de vérification</Button>
            ) : undefined
          }
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
        title="Notifications opérationnelles"
        description="Messages opérationnels sur vos leads et votre compte. Aucun engagement contractuel, aucun contenu promotionnel."
      />
      {notif && NOTICES[notif] ? (
        <Notice tone={notif === "read" || notif === "preferences_saved" ? "success" : "warning"}>{NOTICES[notif]}</Notice>
      ) : null}

      <Split>
        <Card
          title="Boîte de réception"
          actions={unreadCount > 0 ? <Badge tone="info">{unreadCount === 1 ? "1 non lue" : `${unreadCount} non lues`}</Badge> : undefined}
        >
          {inbox.status !== "success" ? (
            <Notice tone="warning">
              <p>Notifications temporairement indisponibles. Rechargez la page dans quelques instants.</p>
              <p><a href="/notifications">Recharger la page</a></p>
            </Notice>
          ) : inbox.data.length === 0 ? (
            <EmptyState
              icon="bell"
              title="Aucune notification pour votre cabinet."
              description="Les nouveaux leads assignés et les événements de votre compte apparaissent ici, et par e-mail. Rien à faire pour l'instant."
              action={<Button href="/leads" variant="secondary">Voir mes leads</Button>}
            />
          ) : (
            <ul className="bo-list">
              {inbox.data.map((notification) => (
                <li key={notification.id} className={polish.notification} data-read={notification.read ? "true" : "false"}>
                  <div className={styles.entryHead}>
                    <h3 className={styles.entryTitle}>{notification.title}</h3>
                    <StatusBadge status={notification.read ? "read" : "unread"} labels={READ_LABELS} tones={READ_TONES} />
                    <time className={`${styles.entryMeta} bo-ref`} dateTime={notification.createdAt}>{formatNotificationDate(notification.createdAt)}</time>
                  </div>
                  <p className={styles.message}>{notification.body}</p>
                  <Cluster>
                    {MESSAGING_NOTIFICATION_TYPE_LABELS[notification.type] ? <Badge tone="info">{MESSAGING_NOTIFICATION_TYPE_LABELS[notification.type]}</Badge> : null}
                    {notification.targetType === "LeadAssignment" && notification.targetId ? (
                      <Button
                        href={leadNotificationHref(notification.type, notification.targetId, isStarterCrmDenied(session.profile))}
                        variant="secondary"
                        size="sm"
                        aria-label={`${MESSAGING_NOTIFICATION_TYPE_LABELS[notification.type] ? "Ouvrir la conversation" : "Ouvrir le lead"} : ${notification.title}`}
                      >
                        {MESSAGING_NOTIFICATION_TYPE_LABELS[notification.type] ? "Ouvrir la conversation" : "Ouvrir le lead"}
                      </Button>
                    ) : null}
                    {notification.read ? null : (
                      <form action={markNotificationReadAction}>
                        <input type="hidden" name="notificationId" value={notification.id} />
                        <Button type="submit" variant="tertiary" size="sm" aria-label={`Marquer comme lue : ${notification.title}`}>Marquer comme lue</Button>
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
          description="Email et notifications in-app restent actifs en permanence. SMS et WhatsApp ne sont utilisés que si la plateforme les a activés et si vous les acceptez ici."
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
              <Field id="notif-reason" label="Motif (facultatif)" hint="Il est conservé dans l'historique des modifications de vos canaux.">
                <Input {...fieldControlProps("notif-reason", { hint: "Il est conservé dans l'historique des modifications de vos canaux." })} name="reason" placeholder="Motif de la mise à jour" />
              </Field>
              <FormActions>
                <Button type="submit">Enregistrer mes canaux</Button>
              </FormActions>
            </Form>
            </TenantWriteGuard>
          ) : (
            <Notice tone="warning">
              <p>Préférences de canaux momentanément indisponibles. Vos réglages actuels ne sont pas modifiés.</p>
              <p><a href="/notifications">Recharger la page</a></p>
            </Notice>
          )}
        </Card>
      </Split>
    </PageStack>
  );
}
