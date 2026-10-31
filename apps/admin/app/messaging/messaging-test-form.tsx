"use client";

import { useActionState, useId } from "react";
import { sendMessagingTestAction, type MessagingTestActionState } from "../lib/messaging-test-actions";
import { Button, Field, Form, FormActions, Input, Notice, Select, fieldControlProps } from "../lib/ui/admin-ui";

const initialState: MessagingTestActionState = { status: "idle" };

const CHANNEL_LABELS: Record<string, string> = { sms: "SMS", whatsapp: "WhatsApp" };

/** Spec 074 FR-010: test message on one configured channel. Only the masked recipient is displayed. */
export function MessagingTestForm({ channels }: { channels: string[] }) {
  const [state, formAction, pending] = useActionState(sendMessagingTestAction, initialState);
  const base = useId();

  return (
    <Form action={formAction} data-messaging-test-form="true" autoComplete="off">
      <Notice tone="info">Réservé au super admin, MFA requis. Le destinataire n'est jamais affiché en clair.</Notice>
      {state.status !== "idle" ? (
        <Notice tone={state.status === "success" ? "success" : "danger"}>
          <p>{state.message}</p>
          {state.delivery ? (
            <ul className="bo-list">
              <li>Statut : {state.delivery.status}</li>
              <li>Destinataire : <code>{state.delivery.recipientMasked}</code></li>
              <li>Motif : {state.delivery.reason ?? "-"}</li>
            </ul>
          ) : null}
        </Notice>
      ) : null}
      <Field id={`${base}-channel`} label="Canal" required>
        <Select {...fieldControlProps(`${base}-channel`, { required: true })} name="channel" defaultValue={channels[0] ?? ""}>
          {channels.map((channel) => <option key={channel} value={channel}>{CHANNEL_LABELS[channel] ?? channel}</option>)}
        </Select>
      </Field>
      <Field id={`${base}-recipient`} label="Destinataire" hint="Numéro au format international, transmis uniquement au service d'envoi." required>
        <Input {...fieldControlProps(`${base}-recipient`, { required: true })} name="recipient" type="tel" minLength={5} maxLength={120} autoComplete="off" />
      </Field>
      <Field id={`${base}-scopeId`} label="Identifiant de portée" hint="Identifiant du destinataire ou du partenaire concerne par le test." required>
        <Input {...fieldControlProps(`${base}-scopeId`, { required: true })} name="scopeId" autoComplete="off" />
      </Field>
      <Field id={`${base}-reason`} label="Motif (audité)" required>
        <Input {...fieldControlProps(`${base}-reason`, { required: true })} name="reason" minLength={3} maxLength={300} />
      </Field>
      <FormActions>
        <Button type="submit" pending={pending} pendingLabel="Envoi..." disabled={channels.length === 0}>Envoyer un message de test</Button>
      </FormActions>
    </Form>
  );
}
