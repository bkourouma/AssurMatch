"use client";

import { useActionState } from "react";
import {
  createQuoteFormDefinitionAction,
  publishQuoteFormDefinitionAction,
  retireQuoteFormDefinitionAction,
  type QuoteFormActionState
} from "./actions";

const initialState: QuoteFormActionState = { status: "idle" };
const fieldStyle = { minHeight: 38, border: "1px solid #b9c3cf", borderRadius: 6, padding: "0 10px" };
const formStyle = { display: "grid", gap: 12, border: "1px solid #d7dde4", borderRadius: 6, padding: 16 };

function ActionStateNotice({ state }: { state: QuoteFormActionState }) {
  if (state.status === "idle") return null;
  return (
    <div role={state.status === "error" ? "alert" : "status"} style={{ border: "1px solid #d7dde4", borderRadius: 6, padding: 12, background: state.status === "error" ? "#fff4f2" : "#f2fbf7" }}>
      <p style={{ margin: 0 }}>{state.message}</p>
    </div>
  );
}

export function CreateQuoteFormDefinitionForm() {
  const [state, formAction, pending] = useActionState(createQuoteFormDefinitionAction, initialState);
  return (
    <form action={formAction} style={formStyle} data-quote-form="create">
      <h2 style={{ margin: 0, fontSize: 20 }}>Creer un brouillon</h2>
      <ActionStateNotice state={state} />
      <label style={{ display: "grid", gap: 6 }}>Pays (UUID)<input name="countryId" required style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>Produit (UUID)<input name="productId" required style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>Langue<input name="language" defaultValue="fr" required style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>Version<input name="version" required style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>Texte de consentement publie (UUID)<input name="consentTextId" required style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>
        Champs (une ligne par champ: cle|libelle|type|obligatoire|sensibilite|options)
        <textarea name="fields" rows={4} required placeholder="vehicle_use|Usage du vehicule|select|true|public|prive,professionnel" style={{ ...fieldStyle, padding: 10 }} />
      </label>
      <label style={{ display: "grid", gap: 6 }}>Note de minimisation des donnees<input name="dataMinimizationNotes" maxLength={500} style={fieldStyle} /></label>
      <label style={{ display: "grid", gap: 6 }}>Motif (audite)<input name="reason" required style={fieldStyle} /></label>
      <p style={{ margin: 0, color: "#516070", fontSize: 13 }}>Un formulaire est toujours cree en brouillon: la publication est un acte distinct et audite.</p>
      <button type="submit" disabled={pending} style={{ minHeight: 40 }}>{pending ? "Creation..." : "Creer le brouillon"}</button>
    </form>
  );
}

export function PublishQuoteFormDefinitionForm({ formIds }: { formIds: string[] }) {
  const [state, formAction, pending] = useActionState(publishQuoteFormDefinitionAction, initialState);
  return (
    <form action={formAction} style={formStyle} data-quote-form="publish">
      <h2 style={{ margin: 0, fontSize: 20 }}>Publier une version</h2>
      <ActionStateNotice state={state} />
      <label style={{ display: "grid", gap: 6 }}>
        Formulaire
        <select name="formId" required style={fieldStyle}>
          {formIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </label>
      <label style={{ display: "grid", gap: 6 }}>Motif (audite)<input name="reason" required style={fieldStyle} /></label>
      <p role="note" style={{ margin: 0, color: "#7a4a12", fontSize: 13 }}>
        Publier expose ce formulaire aux visiteurs et lie la version du texte de consentement. La version publiee precedente pour le meme pays, produit et langue est retiree dans la meme operation.
      </p>
      <button type="submit" disabled={pending || formIds.length === 0} style={{ minHeight: 40 }}>{pending ? "Publication..." : "Publier"}</button>
    </form>
  );
}

export function RetireQuoteFormDefinitionForm({ formIds }: { formIds: string[] }) {
  const [state, formAction, pending] = useActionState(retireQuoteFormDefinitionAction, initialState);
  return (
    <form action={formAction} style={formStyle} data-quote-form="retire">
      <h2 style={{ margin: 0, fontSize: 20 }}>Retirer une version</h2>
      <ActionStateNotice state={state} />
      <label style={{ display: "grid", gap: 6 }}>
        Formulaire
        <select name="formId" required style={fieldStyle}>
          {formIds.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </label>
      <label style={{ display: "grid", gap: 6 }}>Motif (audite)<input name="reason" required style={fieldStyle} /></label>
      <p style={{ margin: 0, color: "#516070", fontSize: 13 }}>Retirer coupe l'exposition publique du formulaire; l'historique des versions est conserve.</p>
      <button type="submit" disabled={pending || formIds.length === 0} style={{ minHeight: 40 }}>{pending ? "Retrait..." : "Retirer"}</button>
    </form>
  );
}
