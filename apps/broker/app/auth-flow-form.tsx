"use client";

import { useActionState } from "react";
import { activateAction, enrollMfaAction, passwordChangeAction, passwordResetConsumeAction, verifyMfaAction, type AuthFlowState } from "./lib/auth-flow-actions";

const inputStyle = { minHeight: 38, border: "1px solid #b9c3cf", borderRadius: 6, padding: "0 10px" };
const panelStyle = { display: "grid", gap: 12, border: "1px solid #d7dde4", borderRadius: 6, padding: 16 };
const initialAuthFlowState: AuthFlowState = { status: "idle" };

function FlowNotice({ state }: { state: AuthFlowState }) {
  if (state.status === "idle") return null;
  return (
    <div role={state.status === "error" ? "alert" : "status"} style={{ border: "1px solid #d7dde4", borderRadius: 6, padding: 12, background: state.status === "error" ? "#fff4f2" : "#f2fbf7" }}>
      <p style={{ margin: 0 }}>{state.message}</p>
      {state.secret ? <p style={{ margin: "8px 0 0" }}>Secret TOTP: <code>{state.secret}</code></p> : null}
      {state.otpauthUri ? <p style={{ margin: "8px 0 0", overflowWrap: "anywhere" }}>URI: <code>{state.otpauthUri}</code></p> : null}
      {state.backupCodes?.length ? (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {state.backupCodes.map((code) => <li key={code}><code>{code}</code></li>)}
        </ul>
      ) : null}
    </div>
  );
}

export function ActivationForm({ returnTo, token }: { returnTo: string; token: string }) {
  const [state, formAction, pending] = useActionState(activateAction, initialAuthFlowState);
  return (
    <form action={formAction} style={panelStyle}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <FlowNotice state={state} />
      <label style={{ display: "grid", gap: 6 }}>
        Jeton activation
        <input name="token" defaultValue={token} required style={inputStyle} />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        Nouveau mot de passe
        <input name="password" type="password" autoComplete="new-password" required minLength={12} style={inputStyle} />
      </label>
      <button type="submit" disabled={pending} style={{ minHeight: 40, border: "1px solid #245f73", background: "#245f73", color: "#fff", borderRadius: 6 }}>
        {pending ? "Activation..." : "Activer et continuer vers MFA"}
      </button>
    </form>
  );
}

export function MfaPanel({ returnTo }: { returnTo: string }) {
  const [enrollState, enrollAction, enrollPending] = useActionState(enrollMfaAction, initialAuthFlowState);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyMfaAction, initialAuthFlowState);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <form action={enrollAction} style={panelStyle}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Enrolement MFA</h2>
        <FlowNotice state={enrollState} />
        <button type="submit" disabled={enrollPending} style={{ minHeight: 40, border: "1px solid #245f73", background: "#245f73", color: "#fff", borderRadius: 6 }}>
          {enrollPending ? "Generation..." : "Generer secret et codes de secours"}
        </button>
      </form>
      <form action={verifyAction} style={panelStyle}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <h2 style={{ margin: 0, fontSize: 20 }}>Verification MFA</h2>
        <FlowNotice state={verifyState} />
        <label style={{ display: "grid", gap: 6 }}>
          Code
          <input name="code" required minLength={6} maxLength={10} style={inputStyle} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          Type
          <select name="kind" defaultValue="totp" style={{ ...inputStyle, minHeight: 40 }}>
            <option value="totp">TOTP</option>
            <option value="backup">Code de secours</option>
          </select>
        </label>
        <button type="submit" disabled={verifyPending} style={{ minHeight: 40, border: "1px solid #245f73", background: "#245f73", color: "#fff", borderRadius: 6 }}>
          {verifyPending ? "Verification..." : "Verifier MFA"}
        </button>
      </form>
    </div>
  );
}

export function PasswordChangeForm() {
  const [state, formAction, pending] = useActionState(passwordChangeAction, initialAuthFlowState);
  return (
    <form action={formAction} style={panelStyle}>
      <FlowNotice state={state} />
      <label style={{ display: "grid", gap: 6 }}>
        Mot de passe actuel
        <input name="oldPassword" type="password" autoComplete="current-password" required minLength={12} style={inputStyle} />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        Nouveau mot de passe
        <input name="newPassword" type="password" autoComplete="new-password" required minLength={12} style={inputStyle} />
      </label>
      <button type="submit" disabled={pending} style={{ minHeight: 40, border: "1px solid #245f73", background: "#245f73", color: "#fff", borderRadius: 6 }}>
        {pending ? "Modification..." : "Changer le mot de passe"}
      </button>
    </form>
  );
}

export function PasswordResetConsumeForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(passwordResetConsumeAction, initialAuthFlowState);
  return (
    <form action={formAction} style={panelStyle}>
      <FlowNotice state={state} />
      <label style={{ display: "grid", gap: 6 }}>
        Jeton reinitialisation
        <input name="token" defaultValue={token} required style={inputStyle} />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        Nouveau mot de passe
        <input name="newPassword" type="password" autoComplete="new-password" required minLength={12} style={inputStyle} />
      </label>
      <button type="submit" disabled={pending} style={{ minHeight: 40, border: "1px solid #245f73", background: "#245f73", color: "#fff", borderRadius: 6 }}>
        {pending ? "Reinitialisation..." : "Consommer le jeton"}
      </button>
    </form>
  );
}
