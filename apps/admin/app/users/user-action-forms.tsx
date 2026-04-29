"use client";

import { useActionState } from "react";
import { createAdminUserAction, passwordResetAction, type UserActionState } from "./actions";
import { adminRoleOptions } from "./user-options";

const initialState: UserActionState = { status: "idle" };

const fieldStyle = { minHeight: 38, border: "1px solid #b9c3cf", borderRadius: 6, padding: "0 10px" };

function ActionStateNotice({ state }: { state: UserActionState }) {
  if (state.status === "idle") return null;
  return (
    <div role={state.status === "error" ? "alert" : "status"} style={{ border: "1px solid #d7dde4", borderRadius: 6, padding: 12, background: state.status === "error" ? "#fff4f2" : "#f2fbf7" }}>
      <p style={{ margin: "0 0 6px" }}>{state.message}</p>
      {state.token ? (
        <p style={{ margin: 0 }}>
          Jeton temporaire a transmettre par canal interne securise: <code>{state.token}</code>
          {state.expiresAt ? ` (expire ${new Date(state.expiresAt).toISOString()})` : ""}
        </p>
      ) : null}
    </div>
  );
}

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState(createAdminUserAction, initialState);

  return (
    <form action={formAction} style={{ display: "grid", gap: 12, border: "1px solid #d7dde4", borderRadius: 6, padding: 16 }}>
      <h2 style={{ margin: 0, fontSize: 20 }}>Creer un utilisateur</h2>
      <ActionStateNotice state={state} />
      <label style={{ display: "grid", gap: 6 }}>
        Email
        <input name="email" type="email" required style={fieldStyle} />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        Nom affiche
        <input name="displayName" required style={fieldStyle} />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        Telephone E.164
        <input name="phone" placeholder="+2250000000000" style={fieldStyle} />
      </label>
      <fieldset style={{ border: "1px solid #d7dde4", borderRadius: 6, padding: 12 }}>
        <legend>Roles</legend>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          {adminRoleOptions.map((role) => (
            <label key={role} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input name="roles" type="checkbox" value={role} />
              {role}
            </label>
          ))}
        </div>
      </fieldset>
      <label style={{ display: "grid", gap: 6 }}>
        Tenant partenaire
        <input name="partnerTenantId" placeholder="UUID tenant pour utilisateurs courtier" style={fieldStyle} />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        Scopes pays
        <input name="countryScopes" placeholder="UUID, UUID" style={fieldStyle} />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        Scopes produits
        <input name="productScopes" placeholder="UUID, UUID" style={fieldStyle} />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        Raison auditable
        <textarea name="reason" required minLength={5} style={{ ...fieldStyle, minHeight: 72, padding: 10 }} />
      </label>
      <button type="submit" disabled={pending} style={{ minHeight: 40, border: "1px solid #245f73", background: "#245f73", color: "#fff", borderRadius: 6 }}>
        {pending ? "Creation..." : "Creer et emettre activation"}
      </button>
    </form>
  );
}

export function PasswordResetForm({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState(passwordResetAction, initialState);

  return (
    <form action={formAction} style={{ display: "grid", gap: 10, border: "1px solid #d7dde4", borderRadius: 6, padding: 14 }}>
      <input type="hidden" name="userId" value={userId} />
      <h2 style={{ margin: 0, fontSize: 18 }}>Reinitialisation mot de passe</h2>
      <ActionStateNotice state={state} />
      <label style={{ display: "grid", gap: 6 }}>
        Raison auditable
        <textarea name="reason" required minLength={5} style={{ ...fieldStyle, minHeight: 64, padding: 10 }} />
      </label>
      <button type="submit" disabled={pending} style={{ minHeight: 38, border: "1px solid #245f73", background: "#245f73", color: "#fff", borderRadius: 6 }}>
        {pending ? "Emission..." : "Emettre un jeton"}
      </button>
    </form>
  );
}
