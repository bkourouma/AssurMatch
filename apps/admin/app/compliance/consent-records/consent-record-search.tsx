"use client";

import { useActionState } from "react";
import type { AdminConsentRecordView } from "../../../../../packages/shared/contracts/compliance.contracts";
import { searchConsentRecordsAction, type ConsentRecordSearchState } from "../../lib/consent-record-actions";
import { Badge, Button, Card, DataTable, Field, Form, FormActions, Input, Select, StateMessage, fieldControlProps, type DataTableColumn, type Tone } from "../../lib/ui/admin-ui";

const initialState: ConsentRecordSearchState = { status: "idle" };

const PURPOSE_LABELS: Record<string, string> = {
  lead_transmission: "Transmission au courtier",
  service_quality_survey: "Enquête de satisfaction",
  document_upload: "Dépôt de documents",
  technical_notification: "Notification technique",
  ai_processing: "Traitement IA",
  marketing_optional: "Marketing (optionnel)"
};

const STATUS_TONES: Record<string, Tone> = { granted: "success", withdrawn: "warning", expired: "disabled", anonymized: "neutral" };

function day(value: string | null): string {
  return value ? value.replace("T", " ").slice(0, 16) : "-";
}

const columns: Array<DataTableColumn<AdminConsentRecordView>> = [
  { key: "grantedAt", header: "Accordé le", render: (row) => day(row.grantedAt) },
  { key: "purpose", header: "Finalité", render: (row) => PURPOSE_LABELS[row.purpose] ?? row.purpose },
  { key: "status", header: "Statut", render: (row) => <Badge tone={STATUS_TONES[row.status] ?? "neutral"}>{row.status}</Badge> },
  { key: "withdrawnAt", header: "Retiré le", render: (row) => day(row.withdrawnAt) },
  { key: "text", header: "Texte (version, langue)", render: (row) => `${row.consentTextVersion ?? "?"} (${row.consentTextLanguage ?? "?"})` },
  { key: "hash", header: "Empreinte du texte", render: (row) => (row.consentTextHash ? <span className="bo-ref">{row.consentTextHash.slice(0, 16)}</span> : "-") },
  { key: "recipient", header: "Destinataire prévu", render: (row) => <code>{row.intendedRecipient}</code> },
  { key: "channel", header: "Canal", render: (row) => row.channel },
  { key: "subject", header: "Sujet (empreinte tronquée)", render: (row) => <span className="bo-ref">{row.subjectFingerprint}</span> },
  { key: "retention", header: "Conservé jusqu'au", render: (row) => day(row.retentionUntil).slice(0, 10) }
];

export function ConsentRecordSearch({ countries }: { countries: Array<{ id: string; label: string }> }) {
  const [state, formAction, pending] = useActionState(searchConsentRecordsAction, initialState);
  return (
    <>
      <Card title="Critères" description="Au moins une référence de demande, une adresse e-mail ou un pays. L'e-mail n'est jamais affiché ni journalisé : l'API le compare à l'empreinte enregistrée.">
        <Form action={formAction} data-consent-record-search="059">
          <Field id="cr-reference" label="Référence de la demande">
            <Input {...fieldControlProps("cr-reference")} name="publicReference" placeholder="QR-2026-XXXXXXXX" />
          </Field>
          <Field id="cr-email" label="E-mail du visiteur">
            <Input {...fieldControlProps("cr-email")} name="email" type="email" autoComplete="off" />
          </Field>
          <Field id="cr-country" label="Pays">
            <Select {...fieldControlProps("cr-country")} name="countryId" defaultValue="">
              <option value="">Tous</option>
              {countries.map((country) => <option key={country.id} value={country.id}>{country.label}</option>)}
            </Select>
          </Field>
          <Field id="cr-purpose" label="Finalité">
            <Select {...fieldControlProps("cr-purpose")} name="purpose" defaultValue="">
              <option value="">Toutes</option>
              {Object.entries(PURPOSE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field id="cr-status" label="Statut">
            <Select {...fieldControlProps("cr-status")} name="status" defaultValue="">
              <option value="">Tous</option>
              <option value="granted">granted</option>
              <option value="withdrawn">withdrawn</option>
              <option value="expired">expired</option>
              <option value="anonymized">anonymized</option>
            </Select>
          </Field>
          <FormActions>
            <Button type="submit" pending={pending} pendingLabel="Recherche...">Rechercher les preuves</Button>
          </FormActions>
        </Form>
      </Card>

      {state.status !== "idle" && state.status !== "success" ? (
        <StateMessage tone={state.status === "invalid" ? "warning" : "danger"}>{state.message}</StateMessage>
      ) : null}

      {state.status === "success" ? (
        <Card as="section" aria-label="Preuves de consentement" title={`${state.result.total} preuve(s) de consentement`} description={state.byEmail ? "Recherche par e-mail : l'adresse saisie n'est pas conservée dans cette page." : undefined}>
          <DataTable
            columns={columns}
            items={state.result.items}
            getKey={(row) => row.id}
            emptyLabel="Aucune preuve pour ces critères."
            aria-label="Preuves de consentement"
            dense
          />
          {state.result.total > state.result.items.length ? <StateMessage>Seules les {state.result.items.length} plus récentes sont affichées : affinez les critères.</StateMessage> : null}
        </Card>
      ) : null}
    </>
  );
}
