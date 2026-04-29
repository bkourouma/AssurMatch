import { redirect } from "next/navigation";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../../lib/backoffice-auth";
import { readAdminUser } from "../../lib/admin-api";
import { adminUserLifecycleAction, updateAdminUserProfileAction, updateAdminUserRolesAction } from "../actions";
import { PasswordResetForm } from "../user-action-forms";
import { adminRoleOptions } from "../user-options";

interface UserDetailPageProps {
  params: Promise<{ userId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function field(name: string, value: string) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      {name}
      <input value={value} readOnly style={{ minHeight: 38, border: "1px solid #d7dde4", borderRadius: 6, padding: "0 10px", background: "#f6f8fb" }} />
    </label>
  );
}

export default async function UserDetailPage({ params, searchParams }: UserDetailPageProps) {
  const { userId } = await params;
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect(`/users/${userId}`, session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent(`/users/${userId}`)}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect(`/login?error=access_denied&returnTo=${encodeURIComponent(`/users/${userId}`)}`);

  const paramsValue = searchParams ? await searchParams : {};
  const notice = firstParam(paramsValue.notice);
  const result = await readAdminUser(userId);
  if (result.unauthenticated) redirect(loginRedirect(`/users/${userId}`, result.error ?? "session_required"));
  if (!result.data) {
    return (
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
        <h1>Utilisateur introuvable</h1>
        <a href="/users">Retour utilisateurs</a>
      </main>
    );
  }
  const user = result.data;

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <p style={{ margin: "0 0 8px", color: "#516070", fontSize: 14 }}>Detail utilisateur</p>
          <h1 style={{ margin: 0, fontSize: 32 }}>{user.displayName}</h1>
          <p style={{ margin: "8px 0 0", color: "#516070" }}>{user.email}</p>
        </div>
        <a href="/users" style={{ color: "#245f73" }}>Retour liste</a>
      </header>

      {notice ? <p role="status">Action terminee: {notice}.</p> : null}
      {result.forbidden ? <p role="alert">Acces refuse pour ce profil utilisateur.</p> : null}
      {result.status === "error" ? <p role="status">Detail indisponible: {result.error}.</p> : null}

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)", gap: 18, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <section style={{ border: "1px solid #d7dde4", borderRadius: 6, padding: 16 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 20 }}>Etat du compte</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              {field("Statut", user.status)}
              {field("MFA", user.mfaStatus)}
              {field("Echecs login", String(user.failedLoginCount ?? 0))}
              {field("Tenant", user.partnerTenantId ?? "-")}
            </div>
          </section>

          <form action={updateAdminUserProfileAction} style={{ display: "grid", gap: 12, border: "1px solid #d7dde4", borderRadius: 6, padding: 16 }}>
            <input type="hidden" name="userId" value={user.id} />
            <h2 style={{ margin: 0, fontSize: 20 }}>Profil et scopes</h2>
            <label style={{ display: "grid", gap: 6 }}>
              Nom affiche
              <input name="displayName" defaultValue={user.displayName} required style={{ minHeight: 38, border: "1px solid #b9c3cf", borderRadius: 6, padding: "0 10px" }} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              Telephone E.164
              <input name="phone" defaultValue={user.phone ?? ""} style={{ minHeight: 38, border: "1px solid #b9c3cf", borderRadius: 6, padding: "0 10px" }} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              Scopes pays
              <input name="countryScopes" defaultValue={user.countryScopes.join(", ")} style={{ minHeight: 38, border: "1px solid #b9c3cf", borderRadius: 6, padding: "0 10px" }} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              Scopes produits
              <input name="productScopes" defaultValue={user.productScopes.join(", ")} style={{ minHeight: 38, border: "1px solid #b9c3cf", borderRadius: 6, padding: "0 10px" }} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              Raison auditable
              <textarea name="reason" required minLength={5} style={{ minHeight: 68, border: "1px solid #b9c3cf", borderRadius: 6, padding: 10 }} />
            </label>
            <button type="submit" style={{ minHeight: 40, border: "1px solid #245f73", background: "#245f73", color: "#fff", borderRadius: 6 }}>Mettre a jour</button>
          </form>

          <form action={updateAdminUserRolesAction} style={{ display: "grid", gap: 12, border: "1px solid #d7dde4", borderRadius: 6, padding: 16 }}>
            <input type="hidden" name="userId" value={user.id} />
            <h2 style={{ margin: 0, fontSize: 20 }}>Roles</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
              {adminRoleOptions.map((role) => (
                <label key={role} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input name="roles" type="checkbox" value={role} defaultChecked={user.roles.includes(role)} />
                  {role}
                </label>
              ))}
            </div>
            <label style={{ display: "grid", gap: 6 }}>
              Raison auditable
              <textarea name="reason" required minLength={5} style={{ minHeight: 68, border: "1px solid #b9c3cf", borderRadius: 6, padding: 10 }} />
            </label>
            <button type="submit" style={{ minHeight: 40, border: "1px solid #245f73", background: "#245f73", color: "#fff", borderRadius: 6 }}>Mettre a jour les roles</button>
          </form>
        </div>

        <aside style={{ display: "grid", gap: 14 }}>
          <PasswordResetForm userId={user.id} />
          <section style={{ border: "1px solid #d7dde4", borderRadius: 6, padding: 14 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 18 }}>Actions sensibles</h2>
            {["suspend", "unsuspend", "lock", "unlock", "mfa-reset", "delete"].map((action) => (
              <form key={action} action={adminUserLifecycleAction} style={{ display: "grid", gap: 8, borderTop: "1px solid #e3e8ef", paddingTop: 10, marginTop: 10 }}>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="action" value={action} />
                <label style={{ display: "grid", gap: 6 }}>
                  Raison pour {action}
                  <textarea name="reason" required minLength={5} style={{ minHeight: 52, border: "1px solid #b9c3cf", borderRadius: 6, padding: 8 }} />
                </label>
                <button type="submit" style={{ minHeight: 36, border: "1px solid #8a3a2a", background: action === "delete" ? "#8a3a2a" : "#fff", color: action === "delete" ? "#fff" : "#8a3a2a", borderRadius: 6 }}>
                  Confirmer {action}
                </button>
              </form>
            ))}
          </section>
        </aside>
      </section>
    </main>
  );
}
