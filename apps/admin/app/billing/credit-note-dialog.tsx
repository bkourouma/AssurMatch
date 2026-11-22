"use client";

import { useState } from "react";
import { issueCreditNoteAction } from "../lib/billing-actions";
import { ConfirmDialog, Field, Input, Select, fieldControlProps } from "../lib/ui/admin-ui";

export interface CancellableInvoice {
  id: string;
  number: string;
  partnerName: string;
  /** Amount already formatted by the page, e.g. "125 000 XOF". */
  totalLabel: string;
}

/**
 * Credit-note confirmation. The dialog names the invoice picked in its own select so the person
 * confirms a precise object, not "the chosen invoice". Field names and the server action are the
 * ones of the former inline dialog.
 */
export function CreditNoteDialog({ invoices }: { invoices: CancellableInvoice[] }) {
  const [invoiceId, setInvoiceId] = useState("");
  const selected = invoices.find((invoice) => invoice.id === invoiceId);
  const title = selected ? `Émettre un avoir sur la facture ${selected.number}` : "Émettre un avoir";
  const description = selected
    ? `La facture ${selected.number} de ${selected.partnerName} (${selected.totalLabel} TTC) sera annulée intégralement par un avoir numéroté. Cette opération est définitive : l'avoir ne peut pas être supprimé.`
    : "Choisissez la facture à annuler : elle sera annulée intégralement par un avoir numéroté. Cette opération est définitive.";

  return (
    <ConfirmDialog
      triggerLabel="Émettre l'avoir"
      triggerVariant="danger"
      title={title}
      description={description}
      confirmLabel="Émettre l'avoir"
      cancelLabel="Annuler"
      tone="danger"
      formAction={issueCreditNoteAction}
    >
      <Field id="credit-note-invoice" label="Facture à annuler" required>
        <Select
          {...fieldControlProps("credit-note-invoice", { required: true })}
          name="invoiceId"
          value={invoiceId}
          onChange={(event) => setInvoiceId(event.target.value)}
          placeholder={invoices.length ? "Choisir une facture" : "Aucune facture annulable"}
          options={invoices.map((invoice) => ({ value: invoice.id, label: `${invoice.number} - ${invoice.partnerName} - ${invoice.totalLabel}` }))}
        />
      </Field>
      <Field id="credit-note-reason" label="Motif de l'avoir" required hint="8 caractères au moins. Le motif est conservé dans le journal d'audit.">
        <Input
          {...fieldControlProps("credit-note-reason", { required: true, hint: "8 caractères au moins. Le motif est conservé dans le journal d'audit." })}
          name="reason"
          minLength={8}
          maxLength={300}
          placeholder="Ex. : Erreur sur la période facturée"
        />
      </Field>
    </ConfirmDialog>
  );
}
