import { firstValue, formatDateTime, readContactMessages } from "../../lib/operations-api";
import { Badge, Card, Field, FilterBar, PageHeader, PageStack, Select, StateMessage, Stack, fieldControlProps } from "../../lib/ui/admin-ui";
import { ContactStatusForm } from "../../lib/ui/operations-forms";
import { OperationsTabs } from "../../lib/ui/operations-tabs";
import { contactStatusTones } from "../../lib/ui/operations-tones";

/**
 * Spec 056 (H-04): contact inbox (super, compliance and support admins). Status changes are
 * audited without the message body; the reply is written from the operator's own mailbox through a
 * `mailto:` link, nothing is sent by the platform.
 */

const audienceLabels: Record<string, string> = { visitor: "Visiteur", broker: "Courtier", insurer: "Assureur", press: "Presse" };

export default async function AdminContactMessagesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {};
  const filters = { status: firstValue(params.status), audience: firstValue(params.audience) };
  const result = await readContactMessages(filters);

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Operations", href: "/operations" }, { label: "Messages de contact" }]}
        kicker="Operations"
        title="Messages de contact"
        description="Boite de reception du formulaire de contact : statut nouveau, traite ou spam, change de facon auditee."
      />
      <OperationsTabs current="/operations/contact-messages" />

      {result.status === "unauthenticated" ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {result.status === "forbidden" ? <StateMessage tone="danger">Messages de contact non accessibles pour ce role admin.</StateMessage> : null}
      {result.status === "error" ? <StateMessage tone="danger">Messages indisponibles : {result.error}</StateMessage> : null}

      <Card>
        <FilterBar action="/operations/contact-messages" label="Filtres messages" submitLabel="Filtrer" resetLabel="Reinitialiser" resetHref="/operations/contact-messages" activeCount={Object.values(filters).filter(Boolean).length} autoSubmit>
          <Field id="cm-status" label="Statut">
            <Select {...fieldControlProps("cm-status")} name="status" defaultValue={filters.status ?? ""}>
              <option value="">Tous</option>
              <option value="new">Nouveau</option>
              <option value="handled">Traite</option>
              <option value="spam">Spam</option>
            </Select>
          </Field>
          <Field id="cm-audience" label="Audience">
            <Select {...fieldControlProps("cm-audience")} name="audience" defaultValue={filters.audience ?? ""}>
              <option value="">Toutes</option>
              {Object.entries(audienceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
        </FilterBar>
      </Card>

      {result.status === "success" && result.data.length === 0 ? <StateMessage>Aucun message pour ces filtres.</StateMessage> : null}

      <Stack>
        {result.data.map((message) => (
          <Card key={message.id} title={`${message.publicReference} - ${message.subject}`} description={`${audienceLabels[message.audience] ?? message.audience} - recu le ${formatDateTime(message.createdAt)}`}>
            <p>
              <Badge tone={contactStatusTones[message.status] ?? "neutral"}>{message.status}</Badge>
              {message.handledAt ? ` mis a jour le ${formatDateTime(message.handledAt)}` : ""}
              {message.statusReason ? ` - ${message.statusReason}` : ""}
            </p>
            <p>
              {message.name} - <a href={`mailto:${message.emailNormalized}?subject=${encodeURIComponent(`Re: ${message.subject} (${message.publicReference})`)}`}>Repondre par e-mail</a>
              {message.phone ? ` - ${message.phone}` : ""}
            </p>
            <p>{message.message}</p>
            <ContactStatusForm messageId={message.id} current={message.status} />
          </Card>
        ))}
      </Stack>
    </PageStack>
  );
}
