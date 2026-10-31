import { firstValue, formatDateTime, readContactMessages } from "../../lib/operations-api";
import { Badge, Card, DescriptionList, EmptyState, Field, FilterBar, Grid, PageHeader, PageStack, Select, StateMessage, Stack, fieldControlProps } from "../../lib/ui/admin-ui";
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
  const activeFilters = Object.values(filters).filter(Boolean).length;

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Opérations", href: "/operations" }, { label: "Messages de contact" }]}
        title="Messages de contact"
        description="Boîte de réception du formulaire de contact. Le statut (nouveau, traité, spam) change de façon auditée ; la réponse part de votre messagerie."
      />
      <OperationsTabs current="/operations/contact-messages" />

      {result.status === "unauthenticated" ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {result.status === "forbidden" ? <StateMessage tone="danger">Messages de contact non accessibles pour ce rôle admin.</StateMessage> : null}
      {result.status === "error" ? <StateMessage tone="danger">Messages indisponibles : {result.error}</StateMessage> : null}

      <FilterBar action="/operations/contact-messages" label="Filtres messages" submitLabel="Filtrer" resetLabel="Réinitialiser" resetHref="/operations/contact-messages" activeCount={activeFilters} autoSubmit>
        <Field id="cm-status" label="Statut">
          <Select {...fieldControlProps("cm-status")} name="status" defaultValue={filters.status ?? ""}>
            <option value="">Tous</option>
            <option value="new">Nouveau</option>
            <option value="handled">Traité</option>
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

      {result.status === "success" && result.data.length === 0 ? (
        <EmptyState
          icon="message"
          title="Aucun message pour ces filtres."
          description={activeFilters > 0 ? "Réinitialisez les filtres pour revoir toute la boîte de réception." : "Les messages envoyés depuis le formulaire de contact du site apparaissent ici."}
        />
      ) : null}

      <Stack as="section" aria-label="Boîte de réception">
        {result.data.map((message) => (
          <Card
            key={message.id}
            title={message.subject}
            description={`${audienceLabels[message.audience] ?? message.audience} - reçu le ${formatDateTime(message.createdAt)}`}
            actions={<Badge tone={contactStatusTones[message.status] ?? "neutral"}>{message.status}</Badge>}
          >
            <Grid columns="two">
              <Stack>
                <DescriptionList
                  columns={2}
                  items={[
                    { term: "Référence", value: <span className="bo-ref">{message.publicReference}</span> },
                    { term: "Expéditeur", value: message.name },
                    { term: "Téléphone", value: message.phone ?? "-" },
                    {
                      term: "Réponse",
                      value: <a href={`mailto:${message.emailNormalized}?subject=${encodeURIComponent(`Re: ${message.subject} (${message.publicReference})`)}`}>Répondre par e-mail</a>
                    },
                    ...(message.handledAt ? [{ term: "Mis à jour le", value: formatDateTime(message.handledAt) }] : []),
                    ...(message.statusReason ? [{ term: "Motif", value: message.statusReason }] : [])
                  ]}
                />
                <p className="bo-break">{message.message}</p>
              </Stack>
              <ContactStatusForm messageId={message.id} current={message.status} />
            </Grid>
          </Card>
        ))}
      </Stack>
    </PageStack>
  );
}
