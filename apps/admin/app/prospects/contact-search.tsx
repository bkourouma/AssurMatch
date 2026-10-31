"use client";

import { useActionState } from "react";
import type { AdminProspectListItem } from "../../../../packages/shared/contracts/admin-operations.contracts";
import { Badge, Button, Card, DataTable, Field, Form, FormActions, Input, StateMessage, fieldControlProps, type DataTableColumn } from "../lib/ui/admin-ui";
import { searchProspectsByContactAction, type ProspectContactSearchState } from "./search-action";
import { productLabel } from "../lib/ui/operations-labels";

/**
 * Spec 073 x lot 8: exact e-mail / phone search. The value goes to the server action in the POST
 * body, then to the API body, which matches the keyed blind index. The result is rendered here from
 * the action state (masked rows only): no URL, no redirect, no hash, and the typed value is not kept.
 */

const initialState: ProspectContactSearchState = { status: "idle" };

function day(value: string | null | undefined): string {
  return value ? value.replace("T", " ").slice(0, 16) : "-";
}

const columns: Array<DataTableColumn<AdminProspectListItem>> = [
  { key: "name", header: "Nom", render: (row) => row.displayName ?? "-" },
  { key: "email", header: "E-mail (masqué)", render: (row) => row.email ?? "-" },
  { key: "phone", header: "Téléphone (masqué)", render: (row) => row.phone ?? "-" },
  { key: "scope", header: "Pays / produit", render: (row) => `${row.countryCode ?? "-"} / ${productLabel(row.productKey)}` },
  { key: "quotes", header: "Demandes de devis", render: (row) => row.quoteRequestCount, numeric: true, align: "right" },
  { key: "state", header: "État", render: (row) => (row.anonymized ? <Badge tone="neutral">Anonymisé</Badge> : <Badge tone="success">Actif</Badge>) },
  { key: "created", header: "Créé le", render: (row) => day(row.createdAt) }
];

export function ProspectContactSearch() {
  const [state, formAction, pending] = useActionState(searchProspectsByContactAction, initialState);
  return (
    <>
      <Card title="Recherche par e-mail ou téléphone" description="Correspondance exacte. La valeur saisie est envoyée dans le corps de la requête, jamais dans l'adresse de la page, et n'est ni conservée ni journalisée.">
        <Form action={formAction} data-prospect-contact-search="073">
          <Field id="prospect-contact" label="E-mail ou téléphone exact">
            <Input {...fieldControlProps("prospect-contact")} name="contact" type="search" autoComplete="off" maxLength={200} placeholder="+2250102030405" />
          </Field>
          <FormActions>
            <Button type="submit" size="sm" pending={pending} pendingLabel="Recherche...">Rechercher</Button>
          </FormActions>
        </Form>
      </Card>

      {state.status !== "idle" && state.status !== "success" ? (
        <StateMessage tone={state.status === "invalid" ? "warning" : "danger"}>{state.message}</StateMessage>
      ) : null}

      {state.status === "success" ? (
        <Card as="section" aria-label="Prospects trouvés par e-mail ou téléphone" title={`${state.result.total} prospect(s) pour ce contact`}>
          <DataTable
            columns={columns}
            items={state.result.items}
            getKey={(row) => row.id}
            getRowHref={(row) => `/prospects/${row.id}`}
            emptyLabel="Aucun prospect pour ce contact."
            aria-label="Prospects trouvés par contact"
          />
          {state.result.total > state.result.items.length ? <StateMessage>Seuls les {state.result.items.length} plus récents sont affichés.</StateMessage> : null}
        </Card>
      ) : null}
    </>
  );
}
