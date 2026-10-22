"use client";

import { useActionState, useId } from "react";
import { ActionNotice, Button, Card, Field, Form, FormActions, Input, Select, fieldControlProps } from "../lib/ui/admin-ui";
import { sendMessagingTestAction, type MessagingTestActionState } from "./actions";

const initialState: MessagingTestActionState = { status: "idle" };

export function MessagingTestForm({ channels }: { channels: string[] }) {
  const [state, formAction, pending] = useActionState(sendMessagingTestAction, initialState);
  const base = useId();
  const ids = { channel: `${base}-channel`, recipient: `${base}-recipient`, template: `${base}-template`, reason: `${base}-reason` };
  const options = channels.filter((channel) => channel === "sms" || channel === "whatsapp").map((channel) => ({ value: channel, label: channel }));

  return (
    <Card
      title="Envoyer un message de test"
      description="Reserve au super administrateur. Le message part uniquement si le flag du canal est actif et si un fournisseur est configure; sinon le refus est affiche avec son motif. Le destinataire n'est jamais affiche en clair."
    >
      <Form action={formAction} data-messaging-form="test">
        <ActionNotice state={state} />
        <Field id={ids.channel} label="Canal" required>
          <Select {...fieldControlProps(ids.channel, { required: true })} name="channel" options={options} />
        </Field>
        <Field id={ids.recipient} label="Destinataire de test (numero)" required>
          <Input {...fieldControlProps(ids.recipient, { required: true })} name="recipient" type="tel" autoComplete="off" minLength={5} maxLength={120} />
        </Field>
        <Field id={ids.template} label="Modele">
          <Input {...fieldControlProps(ids.template)} name="template" value="messaging_channel_test" readOnly />
        </Field>
        <Field id={ids.reason} label="Motif (audite)" required>
          <Input {...fieldControlProps(ids.reason, { required: true })} name="reason" minLength={3} maxLength={300} />
        </Field>
        <FormActions>
          <Button type="submit" pending={pending} pendingLabel="Envoi..." disabled={options.length === 0}>Envoyer le message de test</Button>
        </FormActions>
      </Form>
    </Card>
  );
}
