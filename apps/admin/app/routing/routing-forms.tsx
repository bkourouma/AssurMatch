"use client";

import { useActionState } from "react";
import type { PendingManualQuoteData } from "../lib/admin-api";
import { assignPendingQuoteAction, createRoutingRuleAction, reassignLeadAction, updateRoutingRuleAction, type RoutingActionState } from "./actions";

const initialState: RoutingActionState = { status: "idle" };
const fieldStyle = { minHeight: 38, border: "1px solid #b9c3cf", borderRadius: 6, padding: "0 10px" };
const formStyle = { display: "grid", gap: 12, border: "1px solid #d7dde4", borderRadius: 6, padding: 16 };

const modeOptions: Array<{ value: string; label: string }> = [
  { value: "first_eligible", label: "Premier eligible (comportement historique)" },
  { value: "round_robin", label: "Round-robin (le moins recemment servi)" },
  { value: "priority", label: "Priorite commerciale (ordre configure)" },
  { value: "capacity", label: "Capacite (quota mensuel restant)" },
  { value: "performance", label: "Performance (taux d'acceptation, reactivite)" },
  { value: "exclusive", label: "Exclusif (un seul courtier partenaire)" },
  { value: "manual", label: "Manuel (assignation par un admin)" },
  { value: "multi_send", label: "Multi-courtiers (si le flag est ouvert et si le visiteur l'accepte)" }
];

function ActionStateNotice({ state }: { state: RoutingActionState }) {
  if (state.status === "idle") return null;
  return (
    <div role={state.status === "error" ? "alert" : "status"} style={{ border: "1px solid #d7dde4", borderRadius: 6, padding: 12, background: state.status === "error" ? "#fff4f2" : "#f2fbf7" }}>
      <p style={{ margin: 0 }}>{state.message}</p>
    </div>
  );
}

function ModeSelect({ name, required }: { name: string; required?: boolean }) {
  return (
    <select name={name} required={required} defaultValue={required ? "round_robin" : ""} style={fieldStyle}>
      {required ? null : <option value="">(inchange)</option>}
      {modeOptions.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

export function CreateRoutingRuleForm() {
  const [state, formAction, pending] = useActionState(createRoutingRuleAction, initialState);
  return (
    <form action={formAction} style={formStyle} data-routing-form="create">
      <h2 style={{ margin: 0, fontSize: 20 }}>Creer une regle de routage</h2>
      <ActionStateNotice state={state} />
      <label style={{ display: "grid", gap: 6 }}>Pays (UUID)<input name="countryId" required style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>Produit (UUID, vide = tous les produits du pays)<input name="productId" style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>Mode<ModeSelect name="mode" required /></label>
      <label style={{ display: "grid", gap: 6 }}>Priorites (partnerId:priorite, une par ligne, mode priorite)<textarea name="priorities" rows={3} style={{ ...fieldStyle, padding: 10 }} /></label>
      <label style={{ display: "grid", gap: 6 }}>Courtier partenaire exclusif (UUID, mode exclusif)<input name="exclusivePartnerTenantId" style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>Nombre maximum de courtiers (mode multi-courtiers, 2 a 5)<input name="maxRecipients" type="number" min={2} max={5} defaultValue={3} style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>Description<input name="description" maxLength={500} style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>Motif (audite)<input name="reason" required style={fieldStyle} /></label>
      <button type="submit" disabled={pending} style={{ minHeight: 40 }}>{pending ? "Creation..." : "Creer la regle"}</button>
    </form>
  );
}

export function UpdateRoutingRuleForm({ ruleIds }: { ruleIds: string[] }) {
  const [state, formAction, pending] = useActionState(updateRoutingRuleAction, initialState);
  return (
    <form action={formAction} style={formStyle} data-routing-form="update">
      <h2 style={{ margin: 0, fontSize: 20 }}>Mettre a jour une regle</h2>
      <ActionStateNotice state={state} />
      <label style={{ display: "grid", gap: 6 }}>
        Regle
        <select name="ruleId" required style={fieldStyle}>
          {ruleIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </label>
      <label style={{ display: "grid", gap: 6 }}>Mode<ModeSelect name="mode" /></label>
      <label style={{ display: "grid", gap: 6 }}>
        Statut
        <select name="status" defaultValue="" style={fieldStyle}>
          <option value="">(inchange)</option>
          <option value="active">active</option>
          <option value="disabled">desactivee</option>
        </select>
      </label>
      <label style={{ display: "grid", gap: 6 }}>Priorites (partnerId:priorite, une par ligne)<textarea name="priorities" rows={3} style={{ ...fieldStyle, padding: 10 }} /></label>
      <label style={{ display: "grid", gap: 6 }}>Courtier partenaire exclusif (UUID)<input name="exclusivePartnerTenantId" style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>Description<input name="description" maxLength={500} style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>Motif (audite)<input name="reason" required style={fieldStyle} /></label>
      <button type="submit" disabled={pending || ruleIds.length === 0} style={{ minHeight: 40 }}>{pending ? "Mise a jour..." : "Mettre a jour"}</button>
    </form>
  );
}

export function AssignPendingQuoteForm({ quote }: { quote: PendingManualQuoteData }) {
  const [state, formAction, pending] = useActionState(assignPendingQuoteAction, initialState);
  const eligible = quote.candidates.filter((candidate) => candidate.eligible);
  return (
    <form action={formAction} style={{ display: "grid", gap: 8 }} data-routing-form="assign">
      <ActionStateNotice state={state} />
      <input type="hidden" name="quoteRequestId" value={quote.quoteRequestId} />
      <label style={{ display: "grid", gap: 6 }}>
        Courtier partenaire eligible
        <select name="partnerTenantId" required style={fieldStyle}>
          {eligible.map((candidate) => (
            <option key={candidate.partnerTenantId} value={candidate.partnerTenantId}>{candidate.legalName} ({candidate.plan})</option>
          ))}
        </select>
      </label>
      <label style={{ display: "grid", gap: 6 }}>Motif (audite)<input name="reason" required style={fieldStyle} /></label>
      <button type="submit" disabled={pending || eligible.length === 0} style={{ minHeight: 36 }}>{pending ? "Assignation..." : "Assigner"}</button>
      {eligible.length === 0 ? <p style={{ margin: 0, color: "#8a1f11" }}>Aucun courtier partenaire eligible: verifier licences, autorisations et quotas.</p> : null}
    </form>
  );
}

export function ReassignLeadForm() {
  const [state, formAction, pending] = useActionState(reassignLeadAction, initialState);
  return (
    <form action={formAction} style={formStyle} data-routing-form="reassign">
      <h2 style={{ margin: 0, fontSize: 20 }}>Reassigner un lead</h2>
      <ActionStateNotice state={state} />
      <label style={{ display: "grid", gap: 6 }}>Assignation (UUID)<input name="assignmentId" required style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>Nouveau courtier partenaire (UUID)<input name="partnerTenantId" required style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>Motif (audite)<input name="reason" required style={fieldStyle} /></label>
      <button type="submit" disabled={pending} style={{ minHeight: 40 }}>{pending ? "Reassignation..." : "Reassigner"}</button>
      <p style={{ margin: 0, fontSize: 13 }}>Le nouveau courtier partenaire doit etre eligible (licence, autorisations, quota). L'ancien perd l'acces au lead et le nouveau est notifie.</p>
    </form>
  );
}
