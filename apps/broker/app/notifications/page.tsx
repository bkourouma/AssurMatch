import { redirect } from "next/navigation";
import { loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readBrokerInbox, readBrokerNotificationPreferences } from "../lib/broker-api";
import { markNotificationReadAction, updateNotificationPreferencesAction } from "../lib/notification-actions";
import { Badge, Card, PageHeader, StateMessage } from "../lib/ui/broker-ui";

const NOTICES: Record<string, string> = {
  read: "Notification marquee comme lue.",
  preferences_saved: "Preferences de canaux enregistrees et auditees.",
  baseline: "Email et notifications in-app restent actifs: ce sont les canaux operationnels de base.",
  forbidden: "Action refusee par vos permissions.",
  error: "Notifications temporairement indisponibles."
};

export default async function BrokerNotificationsPage({ searchParams }: { searchParams: Promise<{ notif?: string }> }) {
  const { notif } = await searchParams;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/notifications", session.status));
  if (session.status !== "authenticated") {
    return (
      <div className="page-stack">
        <PageHeader kicker="Notifications" title="Acces refuse" description="Les notifications exigent une session courtier authentifiee et la MFA verifiee." />
      </div>
    );
  }

  const [inbox, preferences] = await Promise.all([readBrokerInbox(), readBrokerNotificationPreferences()]);

  return (
    <div className="page-stack">
      <PageHeader
        kicker="Notifications"
        title="Notifications operationnelles"
        description="Messages operationnels sur vos leads et votre compte. Aucun engagement contractuel, aucun contenu promotionnel."
      />
      {notif && NOTICES[notif] ? <StateMessage tone={notif === "read" || notif === "preferences_saved" ? "info" : "warning"}>{NOTICES[notif]}</StateMessage> : null}

      <Card plain>
        <h2 className="section-title">Boite de reception</h2>
        {inbox.status !== "success" || inbox.data.length === 0 ? (
          <p className="page-description">Aucune notification pour votre cabinet.</p>
        ) : (
          <ul className="simple-list">
            {inbox.data.map((notification) => (
              <li key={notification.id}>
                <div className="inline-cluster">
                  <strong>{notification.title}</strong>
                  <Badge tone={notification.read ? "neutral" : "info"}>{notification.read ? "lue" : "non lue"}</Badge>
                  <span>{new Date(notification.createdAt).toISOString().slice(0, 16).replace("T", " ")}</span>
                </div>
                <p>{notification.body}</p>
                {notification.targetType === "LeadAssignment" && notification.targetId ? (
                  <a href={`/crm/leads/${notification.targetId}`}>Ouvrir le lead</a>
                ) : null}
                {notification.read ? null : (
                  <form action={markNotificationReadAction}>
                    <input type="hidden" name="notificationId" value={notification.id} />
                    <button type="submit" className="button button--secondary">Marquer comme lue</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card plain>
        <h2 className="section-title">Canaux de notification</h2>
        <p className="page-description">
          Email et notifications in-app restent actifs en permanence. SMS et WhatsApp ne sont utilises que si la plateforme les a actives et si vous les acceptez ici.
        </p>
        {preferences.status === "success" ? (
          <form action={updateNotificationPreferencesAction} className="page-stack">
            <div className="inline-cluster">
              <Badge tone="info">email: toujours actif</Badge>
              <Badge tone="info">in-app: toujours actif</Badge>
            </div>
            <label>
              <input type="checkbox" name="sms" defaultChecked={preferences.data.sms} />
              Accepter les notifications SMS
            </label>
            <label>
              <input type="checkbox" name="whatsapp" defaultChecked={preferences.data.whatsapp} />
              Accepter les notifications WhatsApp
            </label>
            <label>
              Motif
              <input name="reason" placeholder="Motif de la mise a jour" />
            </label>
            <button type="submit" className="button button--secondary">Enregistrer mes canaux</button>
          </form>
        ) : (
          <StateMessage tone="warning">Preferences indisponibles: {preferences.error ?? "erreur inconnue"}.</StateMessage>
        )}
      </Card>
    </div>
  );
}
