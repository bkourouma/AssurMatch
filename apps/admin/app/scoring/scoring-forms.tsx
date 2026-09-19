"use client";

import { useActionState } from "react";
import type { ScoringCriterionKey, ScoringWeightsData } from "../lib/admin-api";
import { createScoringRuleAction, scoringCriterionKeys, suspendOfferAction, updateScoringRuleAction, validateOfferAction, type ScoringActionState } from "./actions";

const initialState: ScoringActionState = { status: "idle" };
const fieldStyle = { minHeight: 38, border: "1px solid #b9c3cf", borderRadius: 6, padding: "0 10px" };
const formStyle = { display: "grid", gap: 12, border: "1px solid #d7dde4", borderRadius: 6, padding: 16 };

const criterionLabels: Record<ScoringCriterionKey, string> = {
  guaranteeLevel: "Niveau de garantie",
  price: "Prix",
  deductible: "Franchise",
  processingSpeed: "Rapidite de traitement",
  paymentFlexibility: "Flexibilite de paiement",
  informationQuality: "Qualite des informations",
  userPreferences: "Preferences visiteur"
};

function ActionStateNotice({ state }: { state: ScoringActionState }) {
  if (state.status === "idle") return null;
  return (
    <div role={state.status === "error" ? "alert" : "status"} style={{ border: "1px solid #d7dde4", borderRadius: 6, padding: 12, background: state.status === "error" ? "#fff4f2" : "#f2fbf7" }}>
      <p style={{ margin: 0 }}>{state.message}</p>
    </div>
  );
}

function WeightInputs({ defaults, required }: { defaults?: ScoringWeightsData; required: boolean }) {
  return (
    <fieldset style={{ border: "1px solid #d7dde4", borderRadius: 6, padding: 12, display: "grid", gap: 8 }}>
      <legend>Poids (total 100)</legend>
      {scoringCriterionKeys.map((key) => (
        <label key={key} style={{ display: "grid", gap: 4 }}>
          {criterionLabels[key]}
          <input name={`weight_${key}`} type="number" min={0} max={100} required={required} defaultValue={defaults ? defaults[key] : ""} style={fieldStyle} />
        </label>
      ))}
    </fieldset>
  );
}

export function CreateScoringRuleForm({ defaults }: { defaults: ScoringWeightsData }) {
  const [state, formAction, pending] = useActionState(createScoringRuleAction, initialState);
  return (
    <form action={formAction} style={formStyle} data-scoring-form="create">
      <h2 style={{ margin: 0, fontSize: 20 }}>Creer une regle de scoring</h2>
      <ActionStateNotice state={state} />
      <label style={{ display: "grid", gap: 6 }}>Pays (UUID, vide = tous)<input name="countryId" style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>Produit (UUID, vide = tous)<input name="productId" style={fieldStyle} /></label>
      <WeightInputs defaults={defaults} required />
      <label style={{ display: "grid", gap: 6 }}>Description<input name="description" maxLength={500} style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>Motif (audite)<input name="reason" required style={fieldStyle} /></label>
      <button type="submit" disabled={pending} style={{ minHeight: 40 }}>{pending ? "Creation..." : "Creer la regle"}</button>
    </form>
  );
}

export function UpdateScoringRuleForm({ ruleIds }: { ruleIds: string[] }) {
  const [state, formAction, pending] = useActionState(updateScoringRuleAction, initialState);
  return (
    <form action={formAction} style={formStyle} data-scoring-form="update">
      <h2 style={{ margin: 0, fontSize: 20 }}>Mettre a jour une regle</h2>
      <ActionStateNotice state={state} />
      <label style={{ display: "grid", gap: 6 }}>
        Regle
        <select name="ruleId" required style={fieldStyle}>{ruleIds.map((id) => <option key={id} value={id}>{id}</option>)}</select>
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        Statut
        <select name="status" defaultValue="" style={fieldStyle}>
          <option value="">(inchange)</option>
          <option value="active">active</option>
          <option value="disabled">desactivee</option>
        </select>
      </label>
      <WeightInputs required={false} />
      <label style={{ display: "grid", gap: 6 }}>Description<input name="description" maxLength={500} style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>Motif (audite)<input name="reason" required style={fieldStyle} /></label>
      <button type="submit" disabled={pending || ruleIds.length === 0} style={{ minHeight: 40 }}>{pending ? "Mise a jour..." : "Mettre a jour"}</button>
    </form>
  );
}

export function OfferDecisionForm({ offerId, offerName }: { offerId: string; offerName: string }) {
  const [validateState, validateAction, validating] = useActionState(validateOfferAction, initialState);
  const [suspendState, suspendAction, suspending] = useActionState(suspendOfferAction, initialState);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <form action={validateAction} style={{ display: "grid", gap: 6 }} data-scoring-form="validate-offer">
        <ActionStateNotice state={validateState} />
        <input type="hidden" name="offerId" value={offerId} />
        <select name="validationStatus" defaultValue="validated" aria-label={`Decision ${offerName}`} style={fieldStyle}>
          <option value="validated">Valider (publiable)</option>
          <option value="rejected">Rejeter</option>
        </select>
        <input name="reason" placeholder="Motif (audite)" required style={fieldStyle} />
        <button type="submit" disabled={validating} style={{ minHeight: 34 }}>{validating ? "..." : "Appliquer la decision"}</button>
      </form>
      <form action={suspendAction} style={{ display: "grid", gap: 6 }} data-scoring-form="suspend-offer">
        <ActionStateNotice state={suspendState} />
        <input type="hidden" name="offerId" value={offerId} />
        <input name="reason" placeholder="Motif de suspension (audite)" required style={fieldStyle} />
        <button type="submit" disabled={suspending} style={{ minHeight: 34 }}>{suspending ? "..." : "Suspendre (retrait public)"}</button>
      </form>
    </div>
  );
}
