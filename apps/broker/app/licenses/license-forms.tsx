"use client";

import { useActionState, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { renewLicenseAction, type SelfServiceActionState } from "../lib/self-service-actions";
import { PROOF_ACCEPT, PROOF_MAX_BYTES, UPLOAD_CSRF_HEADER } from "../lib/self-service-messages";
import { Button, Card, Field, Form, FormActions, Input, Notice, Select, fieldControlProps } from "../lib/ui/broker-ui";
import { SelfServiceResult } from "../company/company-forms";

/**
 * Spec 053 US2 (G-02): renewal draft and licence proof. The renewal keeps the country of the
 * renewed licence; the proof goes through the same-origin route handler (`/licenses/:id/documents`)
 * because a server action body is capped at 1 MB and a proof may weigh 5 MB. A clean proof sends
 * the licence to the compliance review; the broker never validates it.
 */
const initialState: SelfServiceActionState = { status: "idle" };

export function RenewLicenseForm({ licenseId, licenseNumber, products }: { licenseId: string; licenseNumber: string; products: Array<{ value: string; label: string }> }) {
  const [state, formAction, pending] = useActionState(renewLicenseAction, initialState);
  const base = useId();
  return (
    <Card muted title={`Déposer le renouvellement de ${licenseNumber}`} description="La nouvelle licence reste en brouillon jusqu'au dépôt de la preuve, puis en revue jusqu'à la décision de la conformité. L'actuelle reste valide d'ici là.">
      <SelfServiceResult state={state} />
      <Form action={formAction} columns={2} data-license-form="renew">
        <input type="hidden" name="licenseId" value={licenseId} />
        <Field id={`${base}-number`} label="Numéro de la nouvelle licence" required>
          <Input {...fieldControlProps(`${base}-number`, { required: true })} name="licenseNumber" minLength={3} maxLength={64} />
        </Field>
        <Field id={`${base}-authority`} label="Autorité de délivrance" required>
          <Input {...fieldControlProps(`${base}-authority`, { required: true })} name="issuingAuthority" minLength={2} maxLength={160} />
        </Field>
        <Field id={`${base}-effective`} label="Date d'effet" required>
          <Input {...fieldControlProps(`${base}-effective`, { required: true })} name="effectiveDate" type="date" />
        </Field>
        <Field id={`${base}-expiration`} label="Date d'expiration" required>
          <Input {...fieldControlProps(`${base}-expiration`, { required: true })} name="expirationDate" type="date" />
        </Field>
        <Field id={`${base}-products`} label="Produits couverts" hint="Aucune sélection : tous les produits du pays.">
          <Select {...fieldControlProps(`${base}-products`, { hint: "x" })} name="productIds" multiple options={products} />
        </Field>
        <Field id={`${base}-reason`} label="Commentaire (facultatif, audité)">
          <Input {...fieldControlProps(`${base}-reason`)} name="reason" maxLength={500} />
        </Field>
        <FormActions>
          <Button type="submit" variant="secondary" pending={pending} pendingLabel="Enregistrement...">Enregistrer le renouvellement</Button>
        </FormActions>
      </Form>
    </Card>
  );
}

export function UploadProofForm({ licenseId, licenseNumber }: { licenseId: string; licenseNumber: string }) {
  const router = useRouter();
  const [state, setState] = useState<SelfServiceActionState>(initialState);
  const [pending, setPending] = useState(false);
  const base = useId();

  async function submit(formData: FormData): Promise<void> {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setState({ status: "error", message: "Choisissez un fichier (PDF, JPEG ou PNG)." });
      return;
    }
    if (file.size > PROOF_MAX_BYTES) {
      setState({ status: "error", message: "Fichier trop volumineux : 5 Mo au maximum." });
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/licenses/${encodeURIComponent(licenseId)}/documents`, {
        method: "POST",
        body: formData,
        headers: { [UPLOAD_CSRF_HEADER]: "1" },
        credentials: "same-origin"
      });
      const payload = await response.json().catch(() => undefined) as { status?: string; message?: string } | undefined;
      setState({ status: response.ok ? "success" : "error", message: payload?.message ?? (response.ok ? "Preuve déposée." : "Dépôt refusé.") });
      if (response.ok) router.refresh();
    } catch {
      setState({ status: "error", message: "Dépôt impossible : réessayez dans quelques instants." });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card muted title={`Preuve de la licence ${licenseNumber}`} description="PDF, JPEG ou PNG, 5 Mo au plus. Le fichier est analysé par l'antivirus ; un fichier infecté est mis en quarantaine.">
      <SelfServiceResult state={state} />
      {state.status === "success" ? <Notice tone="info">La conformité AssurMatch examine la preuve puis valide ou non la licence.</Notice> : null}
      <Form action={submit} data-license-form="proof">
        <Field id={`${base}-file`} label="Fichier" required>
          <Input {...fieldControlProps(`${base}-file`, { required: true })} name="file" type="file" accept={PROOF_ACCEPT} />
        </Field>
        <Field id={`${base}-reason`} label="Commentaire (facultatif, audité)">
          <Input {...fieldControlProps(`${base}-reason`)} name="reason" maxLength={500} />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Dépôt...">Déposer la preuve</Button>
        </FormActions>
      </Form>
    </Card>
  );
}
