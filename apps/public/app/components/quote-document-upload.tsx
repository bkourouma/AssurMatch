"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { uploadQuoteDocument, type PublicQuoteDocumentUploadState } from "../lib/public-api";

const kindOptions: Array<[string, string]> = [
  ["identity", "Piece d'identite"],
  ["vehicle_registration", "Carte grise / immatriculation"],
  ["driving_license", "Permis de conduire"],
  ["proof_of_address", "Justificatif de domicile"],
  ["medical_form", "Formulaire medical"],
  ["existing_policy", "Contrat ou attestation existante"],
  ["other", "Autre document"]
];

export function QuoteDocumentUpload({ publicReference, token, remainingSlots }: { publicReference: string; token: string; remainingSlots: number }) {
  const router = useRouter();
  const [state, setState] = useState<PublicQuoteDocumentUploadState | { status: "idle" | "submitting"; publicMessage?: string }>({ status: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setState({ status: "error", publicMessage: "Selectionnez un fichier PDF, JPEG ou PNG (5 Mo maximum)." });
      return;
    }
    setState({ status: "submitting", publicMessage: "Envoi en cours." });
    const result = await uploadQuoteDocument(publicReference, token, formData);
    setState(result);
    if (result.status === "success") {
      form.reset();
      router.refresh();
    }
  }

  if (remainingSlots <= 0) return <p role="status">Nombre maximum de documents atteint pour cette demande.</p>;

  return (
    <form className="pub-card pub-card--plain pub-form" onSubmit={submit} aria-label="Ajouter un document">
      <p className="pub-form__hint">Documents optionnels: ils sont verifies puis transmis uniquement au courtier partenaire responsable de votre demande. Ils n'accelerent ni ne garantissent aucune decision.</p>
      <div className="pub-form__grid pub-form__grid--two">
        <label>
          Type de document
          <select name="documentKind" defaultValue="other">
            {kindOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Libelle
          <input name="label" required maxLength={120} placeholder="Ex. carte grise" />
        </label>
        <label>
          Fichier (PDF, JPEG ou PNG, 5 Mo maximum)
          <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required />
        </label>
      </div>
      {state.status === "success" || state.status === "disabled" ? <p role="status">{state.publicMessage}</p> : null}
      {state.status === "error" || state.status === "rate_limited" ? <p role="alert">{state.publicMessage}</p> : null}
      {state.status === "submitting" ? <p role="status">{state.publicMessage}</p> : null}
      <div className="pub-form__actions">
        <button className="pub-button--primary" type="submit" disabled={state.status === "submitting"}>Ajouter le document</button>
        <p className="pub-form__hint">Emplacements restants: {remainingSlots}</p>
      </div>
    </form>
  );
}
