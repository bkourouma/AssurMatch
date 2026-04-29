import { redirect } from "next/navigation";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readAdminUsers, type AdminUser } from "../lib/admin-api";
import { CreateUserForm } from "./user-action-forms";
import { adminRoleOptions, userStatusOptions } from "./user-options";

interface UsersPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function includesSearch(user: AdminUser, search: string): boolean {
  if (!search) return true;
  const haystack = [user.email, user.displayName, user.id, user.partnerTenantId ?? "", ...user.roles].join(" ").toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function formatDate(value?: string | null): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "-";
}

export default async function UserManagementPage({ searchParams }: UsersPageProps) {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/users", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/users")}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Fusers");

  const params = searchParams ? await searchParams : {};
  const search = firstParam(params.search);
  const status = firstParam(params.status);
  const role = firstParam(params.role);
  const notice = firstParam(params.notice);

  const users = await readAdminUsers({ ...(status ? { status } : {}), ...(role ? { role } : {}) });
  if (users.unauthenticated) redirect(loginRedirect("/users", users.error ?? "session_required"));
  const filtered = users.data.filter((user) => includesSearch(user, search));

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif", color: "#172033" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <p style={{ margin: "0 0 8px", color: "#516070", fontSize: 14 }}>Back-office plateforme</p>
          <h1 style={{ margin: 0, fontSize: 32 }}>Utilisateurs et roles</h1>
          <p style={{ maxWidth: 720, lineHeight: 1.55 }}>
            Gestion persistee des comptes, roles, scopes, statuts, MFA et actions sensibles. Les changements sont valides et audites cote API.
          </p>
        </div>
        <a href="/" style={{ color: "#245f73" }}>Retour admin</a>
      </header>

      {notice ? <p role="status">Action terminee: {notice}.</p> : null}
      {users.forbidden ? <p role="alert">Acces refuse: votre role ne permet pas de lire les utilisateurs.</p> : null}
      {users.status === "error" ? <p role="status">Liste indisponible: {users.error}.</p> : null}

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(320px, 1fr)", gap: 18, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <form action="/users" style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 180px 220px auto", gap: 10, alignItems: "end", border: "1px solid #d7dde4", borderRadius: 6, padding: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>
              Recherche
              <input name="search" defaultValue={search} placeholder="Email, nom, tenant, role" style={{ minHeight: 38, border: "1px solid #b9c3cf", borderRadius: 6, padding: "0 10px" }} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              Statut
              <select name="status" defaultValue={status} style={{ minHeight: 40, border: "1px solid #b9c3cf", borderRadius: 6, padding: "0 10px" }}>
                <option value="">Tous</option>
                {userStatusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              Role
              <select name="role" defaultValue={role} style={{ minHeight: 40, border: "1px solid #b9c3cf", borderRadius: 6, padding: "0 10px" }}>
                <option value="">Tous</option>
                {adminRoleOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <button type="submit" style={{ minHeight: 40, border: "1px solid #245f73", background: "#245f73", color: "#fff", borderRadius: 6 }}>Filtrer</button>
          </form>

          <section aria-label="Liste utilisateurs" style={{ overflowX: "auto", border: "1px solid #d7dde4", borderRadius: 6 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#f6f8fb" }}>
                  <th style={{ padding: 10 }}>Utilisateur</th>
                  <th style={{ padding: 10 }}>Roles</th>
                  <th style={{ padding: 10 }}>Statut</th>
                  <th style={{ padding: 10 }}>MFA</th>
                  <th style={{ padding: 10 }}>Derniere connexion</th>
                  <th style={{ padding: 10 }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id} style={{ borderTop: "1px solid #e3e8ef" }}>
                    <td style={{ padding: 10 }}>
                      <strong>{user.displayName}</strong>
                      <div style={{ color: "#516070" }}>{user.email}</div>
                      {user.partnerTenantId ? <div style={{ color: "#516070" }}>Tenant {user.partnerTenantId}</div> : null}
                    </td>
                    <td style={{ padding: 10 }}>{user.roles.join(", ")}</td>
                    <td style={{ padding: 10 }}>{user.status}</td>
                    <td style={{ padding: 10 }}>{user.mfaStatus}</td>
                    <td style={{ padding: 10 }}>{formatDate(user.lastLoginAt)}</td>
                    <td style={{ padding: 10 }}><a href={`/users/${encodeURIComponent(user.id)}`}>Ouvrir</a></td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 14 }}>Aucun utilisateur pour ces filtres.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </div>

        <CreateUserForm />
      </section>
    </main>
  );
}
