import { redirect } from "next/navigation";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readAdminUsers, type AdminUser } from "../lib/admin-api";
import { CreateUserForm } from "./user-action-forms";
import { adminRoleOptions, userStatusOptions } from "./user-options";
import { Badge, Card, DataTable, PageHeader, StateMessage } from "../lib/ui/admin-ui";
import { roleLabel } from "../lib/ui/admin-view-models";

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
    <div className="page-stack">
      <PageHeader
        kicker="Back-office plateforme"
        title="Utilisateurs et roles"
        description="Gestion persistee des comptes, roles, scopes, statuts, MFA et actions sensibles. Les changements sont valides et audites cote API."
        actions={<a className="button button--secondary" href="/">Retour admin</a>}
      />

      {notice ? <StateMessage>Action terminee: {notice}.</StateMessage> : null}
      {users.forbidden ? <StateMessage tone="danger">Acces refuse: votre role ne permet pas de lire les utilisateurs.</StateMessage> : null}
      {users.status === "error" ? <StateMessage tone="danger">Liste indisponible: {users.error}.</StateMessage> : null}

      <section className="split-layout">
        <div style={{ display: "grid", gap: 16 }}>
          <form action="/users" className="admin-card admin-card__body form-grid" aria-label="Filtres utilisateurs">
            <label className="field">
              Recherche
              <input name="search" defaultValue={search} placeholder="Email, nom, tenant, role" />
            </label>
            <label className="field">
              Statut
              <select name="status" defaultValue={status}>
                <option value="">Tous</option>
                {userStatusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="field">
              Role
              <select name="role" defaultValue={role}>
                <option value="">Tous</option>
                {adminRoleOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <button className="button" type="submit">Filtrer</button>
          </form>

          <section aria-label="Liste utilisateurs">
            <DataTable
              columns={[
                {
                  header: "Utilisateur",
                  render: (user) => (
                    <>
                      <strong>{user.displayName}</strong>
                      <div>{user.email}</div>
                      {user.partnerTenantId ? <div>Tenant {user.partnerTenantId}</div> : null}
                    </>
                  )
                },
                { header: "Roles", render: (user) => roleLabel(user.roles) },
                { header: "Statut", render: (user) => <Badge tone={user.status === "active" ? "success" : user.status === "suspended" || user.status === "locked" ? "danger" : "warning"}>{user.status}</Badge> },
                { header: "MFA", render: (user) => <Badge tone={user.mfaStatus === "verified" || user.mfaStatus === "enrolled" ? "success" : "warning"}>{user.mfaStatus}</Badge> },
                { header: "Derniere connexion", render: (user) => formatDate(user.lastLoginAt) },
                { header: "Detail", render: (user) => <a href={`/users/${encodeURIComponent(user.id)}`}>Ouvrir</a> }
              ]}
              items={filtered}
              getKey={(user) => user.id}
              emptyLabel="Aucun utilisateur pour ces filtres."
            />
          </section>
        </div>

        <Card><CreateUserForm /></Card>
      </section>
    </div>
  );
}
