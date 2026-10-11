import { redirect } from "next/navigation";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { readAdminPartners, readAdminUsers, type AdminUser } from "../lib/admin-api";
import { partnerStatusLabel } from "../lib/partner-messages";
import { CreateUserForm } from "./user-action-forms";
import { adminRoleOptions, userStatusOptions } from "./user-options";
import {
  Button,
  DataTable,
  Field,
  FilterBar,
  Input,
  PageHeader,
  PageStack,
  Select,
  StateMessage,
  StatusBadge,
  fieldControlProps,
  mfaStatusTones,
  paginateItems,
  readTableParams,
  sortItems,
  userStatusTones
} from "../lib/ui/admin-ui";
import type { DataTableColumn } from "../lib/ui/admin-ui";
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

const columns: Array<DataTableColumn<AdminUser>> = [
  {
    key: "user",
    header: "Utilisateur",
    render: (user) => (
      <>
        <a href={`/users/${encodeURIComponent(user.id)}`}><strong>{user.displayName}</strong></a>
        <div className="bo-description">{user.email}</div>
        {user.partnerTenantId ? <div className="bo-description">Tenant <span className="bo-ref">{user.partnerTenantId}</span></div> : null}
      </>
    ),
    sortable: true,
    sortValue: (user) => user.displayName
  },
  { key: "roles", header: "Roles", render: (user) => roleLabel(user.roles), sortable: true, sortValue: (user) => user.roles.join(", ") },
  { key: "status", header: "Statut", render: (user) => <StatusBadge status={user.status} tones={userStatusTones} />, sortable: true, sortValue: (user) => user.status },
  { key: "mfa", header: "MFA", render: (user) => <StatusBadge status={user.mfaStatus} tones={mfaStatusTones} />, sortable: true, sortValue: (user) => user.mfaStatus },
  {
    key: "lastLogin",
    header: "Derniere connexion",
    render: (user) => formatDate(user.lastLoginAt),
    sortable: true,
    sortValue: (user) => user.lastLoginAt ?? null
  },
  { key: "detail", header: "", align: "right", render: (user) => <Button href={`/users/${encodeURIComponent(user.id)}`} size="sm" variant="tertiary">Ouvrir</Button> }
];

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

  const [users, partners] = await Promise.all([
    readAdminUsers({ ...(status ? { status } : {}), ...(role ? { role } : {}) }),
    readAdminPartners()
  ]);
  // Spec 051 T026: partner select of the creation form; a retired partner is never offered.
  const partnerChoices = partners.data
    .filter((partner) => partner.status !== "retired")
    .map((partner) => ({ value: partner.id, label: `${partner.tradeName || partner.legalName} (${partnerStatusLabel(partner.status)})` }))
    .sort((left, right) => left.label.localeCompare(right.label));
  if (users.unauthenticated) redirect(loginRedirect("/users", users.error ?? "session_required"));
  const filtered = users.data.filter((user) => includesSearch(user, search));

  const table = readTableParams(params, {
    pathname: "/users",
    defaultSort: { key: "user", direction: "asc" },
    pageSize: 25
  });
  const rows = paginateItems(sortItems(filtered, columns, table.sort), table.page, table.pageSize);
  const activeFilters = [search, status, role].filter(Boolean).length;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Plateforme" }, { label: "Utilisateurs" }]}
        title="Utilisateurs et roles"
        description="Comptes, roles, scopes, statuts et MFA. Chaque changement est valide et audite cote API."
        actions={<Button href="#creer-utilisateur">Creer un utilisateur</Button>}
      />

      {notice ? <StateMessage>Action terminee: {notice}.</StateMessage> : null}
      {users.forbidden ? <StateMessage tone="danger">Acces refuse: votre role ne permet pas de lire les utilisateurs.</StateMessage> : null}
      {users.status === "error" ? <StateMessage tone="danger">Liste indisponible: {users.error}.</StateMessage> : null}

      <FilterBar
        action="/users"
        label="Filtres utilisateurs"
        submitLabel="Filtrer"
        resetLabel="Reinitialiser"
        resetHref="/users"
        activeCount={activeFilters}
        autoSubmit
      >
        <Field id="users-search" label="Recherche">
          <Input {...fieldControlProps("users-search")} name="search" defaultValue={search} placeholder="Email, nom, tenant, role" />
        </Field>
        <Field id="users-status" label="Statut">
          <Select {...fieldControlProps("users-status")} name="status" defaultValue={status}>
            <option value="">Tous</option>
            {userStatusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </Select>
        </Field>
        <Field id="users-role" label="Role">
          <Select {...fieldControlProps("users-role")} name="role" defaultValue={role}>
            <option value="">Tous</option>
            {adminRoleOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </Select>
        </Field>
      </FilterBar>

      <DataTable
        columns={columns}
        items={rows}
        getKey={(user) => user.id}
        emptyLabel="Aucun utilisateur pour ces filtres."
        emptyDescription={activeFilters > 0 ? "Reinitialisez les filtres pour revoir tous les comptes." : "Creez le premier compte avec le formulaire ci-dessous."}
        aria-label="Liste utilisateurs"
        sort={table.sort}
        sortHref={table.sortHref}
        pagination={{
          page: table.page,
          pageSize: table.pageSize,
          total: filtered.length,
          hrefFor: table.pageHref,
          label: (from, to, total) => `${from}-${to} sur ${total} utilisateurs`
        }}
      />

      <div id="creer-utilisateur">
        <CreateUserForm partners={partnerChoices} />
      </div>
    </PageStack>
  );
}
