import { redirect } from "next/navigation";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readAdminDashboard } from "../lib/admin-api";

export default async function AdminDashboardPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/dashboard", session.status));
  if (session.status === "mfa_required") return <main><h1>MFA requise</h1><p>L'acces dashboard reste bloque tant que la MFA n'est pas verifiee.</p></main>;
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) {
    return <main><h1>Acces refuse</h1><p>Ce compte ne dispose pas d'un acces admin autorise.</p></main>;
  }
  const dashboard = await readAdminDashboard();
  if (dashboard.unauthenticated) redirect(loginRedirect("/dashboard", dashboard.error ?? "session_required"));
  if (dashboard.forbidden) return <main><h1>Acces refuse</h1><p>Le role connecte ne permet pas la lecture du dashboard plateforme.</p></main>;
  if (dashboard.status === "error") return <main><h1>Dashboard plateforme</h1><p role="status">Dashboard indisponible: {dashboard.error}</p></main>;
  const data = dashboard.data;
  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Dashboard plateforme</h1>
        <p style={{ color: "#516070" }}>Indicateurs internes operationnels et conformite. Les chiffres sont indicatifs.</p>
      </header>
      <section aria-label="Volumes de leads" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 12, marginBottom: 22 }}>
        {[
          ["Recus", data.leadVolumes.received],
          ["Transmis", data.leadVolumes.transmitted],
          ["Refuses", data.leadVolumes.refused],
          ["Non routes", data.leadVolumes.nonRouted]
        ].map(([label, value]) => (
          <div key={String(label)} style={{ border: "1px solid #d8dde3", borderRadius: 6, padding: 14 }}>
            <div style={{ color: "#516070", fontSize: 13 }}>{label}</div>
            <strong style={{ display: "block", marginTop: 8, fontSize: 24 }}>{value}</strong>
          </div>
        ))}
      </section>
      <section aria-label="Raisons de non-routage" style={{ marginBottom: 22 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Raisons de non-routage</h2>
        {data.nonRoutedReasons.length === 0 ? <p>Aucune raison enregistree dans la fenetre.</p> : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {data.nonRoutedReasons.map(({ reason, total }) => (
              <li key={reason}>{reason}: {total}</li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Repartition" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 22 }}>
        <div>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Par pays</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {data.byCountry.map(({ countryCode, total }) => <li key={countryCode}>{countryCode}: {total}</li>)}
          </ul>
        </div>
        <div>
          <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Par produit</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {data.byProduct.map(({ productKey, total }) => <li key={productKey}>{productKey}: {total}</li>)}
          </ul>
        </div>
      </section>
      <section aria-label="Partenaires et offres" style={{ marginBottom: 22 }}>
        <p>Partenaires actifs: {data.partners.active}. Inactifs: {data.partners.inactive}.</p>
        <p>Offres expirees encore referencees: {data.expiredOffersStillReferenced}.</p>
        <p>Licences expirees: {data.licenseAlerts.expired}. Licences expirant dans 30 jours: {data.licenseAlerts.expiringSoon}.</p>
      </section>
      <section aria-label="Alertes conformite (synthese)" style={{ marginBottom: 22 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Alertes conformite</h2>
        <p>Consentement absent: {data.complianceAlertCounts.consentMissing}. CRM ferme: {data.complianceAlertCounts.crmFlagClosed}. RBAC refuses: {data.complianceAlertCounts.rbacDenied}. Tentatives inter-tenant: {data.complianceAlertCounts.crossTenantAttempt}. Autres: {data.complianceAlertCounts.other}.</p>
        <p><a href="/dashboard/compliance-alerts">Voir le detail des alertes</a></p>
      </section>
      <section aria-label="Feature flags sensibles">
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Feature flags sensibles (lecture seule)</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {data.sensitiveFeatureFlags.map((flag) => (
            <li key={`${flag.key}|${flag.scopeType}|${flag.scopeId ?? ""}`}>{flag.key} ({flag.scopeType}{flag.scopeId ? `:${flag.scopeId}` : ""}): {flag.value ? "ouvert" : "ferme"}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
