import type { ContentEntryView } from "../../../../../packages/shared/contracts/content-cms.contracts";
import { readContentCapabilities, readContentEntry, readContentHistory } from "../../lib/admin-api";
import { readBackOfficeSession } from "../../lib/backoffice-auth";
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUS_TONES,
  FOUR_EYES_HELP,
  LEGAL_APPROVAL_HELP,
  availableContentActions,
  contentDate,
  contentKindLabel,
  contentLocaleLabel,
  contentReadErrorMessage
} from "../../lib/content-messages";
import {
  Badge,
  Button,
  Card,
  DataTable,
  DescriptionList,
  Grid,
  Notice,
  PageHeader,
  PageStack,
  StateMessage,
  StatusBadge
} from "../../lib/ui/admin-ui";
import type { DataTableColumn } from "../../lib/ui/admin-ui";
import { ContentWorkflowForm, EditContentEntryForm } from "../content-forms";
import { fieldsFromPayload } from "../content-payload";

interface ContentDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function PlainList({ items }: { items: unknown }) {
  if (!Array.isArray(items) || items.length === 0) return <p className="bo-description">-</p>;
  return <ul className="bo-list">{items.map((item, index) => <li key={index}>{String(item)}</li>)}</ul>;
}

function PlainText({ value }: { value: unknown }) {
  return <p style={{ whiteSpace: "pre-wrap" }}>{typeof value === "string" && value ? value : "-"}</p>;
}

function Sections({ sections }: { sections: unknown }) {
  if (!Array.isArray(sections)) return null;
  return (
    <>
      {sections.map((raw, index) => {
        const section = (raw ?? {}) as { id?: unknown; heading?: unknown; body?: unknown; bullets?: unknown };
        return (
          <section key={index}>
            <h3>{String(section.heading ?? "")} <code>{String(section.id ?? "")}</code></h3>
            <PlainList items={section.body} />
            {Array.isArray(section.bullets) && section.bullets.length > 0 ? <PlainList items={section.bullets} /> : null}
          </section>
        );
      })}
    </>
  );
}

/** Content is rendered as React text nodes only: never as markup. */
function EntryContent({ entry }: { entry: ContentEntryView }) {
  const p = entry.payload;
  if (entry.kind === "faq") {
    return (
      <>
        <h3>Question</h3><PlainText value={p.question} />
        <h3>Réponse</h3><PlainText value={p.answer} />
        <h3>Thème</h3><PlainText value={p.theme} />
      </>
    );
  }
  if (entry.kind === "glossary") {
    return (
      <>
        <h3>Terme</h3><PlainText value={p.term} />
        <h3>Définition</h3><PlainText value={p.definition} />
        <h3>Termes liés</h3><PlainList items={p.seeAlso} />
      </>
    );
  }
  if (entry.kind === "guide") {
    return (
      <>
        <h3>Titre</h3><PlainText value={p.title} />
        <h3>Description</h3><PlainText value={p.description} />
        <Sections sections={p.sections} />
        <h3>Points clés</h3><PlainList items={p.keyPoints} />
        <h3>Erreurs à éviter</h3><PlainList items={p.mistakes} />
      </>
    );
  }
  return (
    <>
      <h3>Titre</h3><PlainText value={p.title} />
      <h3>Description</h3><PlainText value={p.description} />
      <h3>Résumé</h3><PlainList items={p.summary} />
      <Sections sections={p.sections} />
      <h3>Éléments à compléter</h3><PlainList items={p.placeholders} />
    </>
  );
}

const historyColumns: Array<DataTableColumn<ContentEntryView>> = [
  { key: "version", header: "Version", render: (entry) => <a href={`/content/${encodeURIComponent(entry.id)}`}>v{entry.version}</a>, numeric: true, align: "right" },
  { key: "status", header: "Statut", render: (entry) => <StatusBadge status={entry.status} tones={CONTENT_STATUS_TONES} labels={CONTENT_STATUS_LABELS} /> },
  { key: "createdAt", header: "Créée le", render: (entry) => contentDate(entry.createdAt) },
  { key: "decidedAt", header: "Décision", render: (entry) => contentDate(entry.decidedAt) },
  { key: "note", header: "Note", render: (entry) => entry.decisionNote ?? "-" }
];

export default async function ContentDetailPage({ params, searchParams }: ContentDetailPageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const notice = Array.isArray(query.notice) ? query.notice[0] : query.notice;
  const [entryState, capabilities, history, session] = await Promise.all([
    readContentEntry(id),
    readContentCapabilities(),
    readContentHistory(id),
    readBackOfficeSession()
  ]);
  const entry = entryState.data;

  if (!entry) {
    return (
      <PageStack>
        <PageHeader
          breadcrumb={[{ label: "Plateforme" }, { label: "Contenu", href: "/content" }, { label: "Détail" }]}
          title="Contenu indisponible"
          actions={<Button href="/content" variant="secondary">Retour à la liste</Button>}
        />
        <StateMessage tone="danger">
          {entryState.forbidden ? contentReadErrorMessage("access_denied") : entryState.unauthenticated ? "Session admin requise." : "Contenu introuvable ou indisponible."}
        </StateMessage>
      </PageStack>
    );
  }

  const caps = capabilities.data;
  const viewerId = session.status === "authenticated" || session.status === "mfa_required" ? session.profile.actorId : undefined;
  const actions = availableContentActions(entry, caps, viewerId);
  const ownSubmission = entry.status === "pending_review" && viewerId !== undefined && entry.submittedById === viewerId;
  const versions = history.data.length > 0 ? history.data : [entry];

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Plateforme" }, { label: "Contenu", href: "/content" }, { label: entry.label }]}
        kicker={contentKindLabel(entry.kind)}
        title={`${entry.label} · v${entry.version}`}
        actions={<Button href="/content" variant="secondary">Retour à la liste</Button>}
      />

      {notice === "created" ? <Notice tone="success">Brouillon créé. Il n&apos;est visible d&apos;aucun visiteur tant qu&apos;il n&apos;est pas approuvé.</Notice> : null}
      {notice === "revised" ? <Notice tone="success">Nouvelle version en brouillon. La version publiée reste en ligne jusqu&apos;à l&apos;approbation de celle-ci.</Notice> : null}

      <Card title="Synthèse">
        <DescriptionList
          columns={2}
          items={[
            { term: "Statut", value: <StatusBadge status={entry.status} tones={CONTENT_STATUS_TONES} labels={CONTENT_STATUS_LABELS} /> },
            { term: "Type", value: contentKindLabel(entry.kind) },
            { term: "Clé", value: <code>{entry.entryKey}</code> },
            { term: "Langue", value: contentLocaleLabel(entry.locale) },
            { term: "Pays", value: entry.countryCode ?? "-" },
            { term: "Version", value: entry.version },
            { term: "Créé par", value: entry.createdById ? <code>{entry.createdById}</code> : "-" },
            { term: "Créé le", value: contentDate(entry.createdAt) },
            { term: "Soumis par", value: entry.submittedById ? <code>{entry.submittedById}</code> : "-" },
            { term: "Soumis le", value: contentDate(entry.submittedAt) },
            { term: "Décidé par", value: entry.decidedById ? <code>{entry.decidedById}</code> : "-" },
            { term: "Décidé le", value: contentDate(entry.decidedAt) },
            { term: "Note de décision", value: entry.decisionNote ?? "-" },
            { term: "Publié le", value: contentDate(entry.publishedAt) }
          ]}
        />
      </Card>

      <Card title="Contenu" description="Texte brut, affiché tel quel.">
        <EntryContent entry={entry} />
      </Card>

      {ownSubmission ? <Notice tone="warning">{FOUR_EYES_HELP}</Notice> : null}
      {entry.status === "pending_review" && entry.kind === "legal_override" ? <Notice tone="info">{LEGAL_APPROVAL_HELP}</Notice> : null}
      {actions.length === 0 ? <StateMessage>Aucune action disponible pour votre rôle sur cette version{entry.status === "archived" ? " (archivée)" : ""}.</StateMessage> : null}

      {actions.includes("edit") ? (
        <EditContentEntryForm id={entry.id} kind={entry.kind} values={fieldsFromPayload(entry.kind, entry.payload)} />
      ) : null}

      <Grid columns="two">
        {actions.includes("submit") ? <ContentWorkflowForm id={entry.id} intent="submit" /> : null}
        {actions.includes("withdraw") ? <ContentWorkflowForm id={entry.id} intent="withdraw" /> : null}
        {actions.includes("approve") ? <ContentWorkflowForm id={entry.id} intent="approve" /> : null}
        {actions.includes("reject") ? <ContentWorkflowForm id={entry.id} intent="reject" /> : null}
        {actions.includes("revise") ? <ContentWorkflowForm id={entry.id} intent="revise" /> : null}
        {actions.includes("archive") ? <ContentWorkflowForm id={entry.id} intent="archive" /> : null}
      </Grid>

      <Card title="Historique des versions" description="Toutes les versions de la même clé, langue et pays.">
        <DataTable
          columns={historyColumns}
          items={versions}
          getKey={(version) => version.id}
          emptyLabel="Aucune version."
          aria-label="Historique des versions"
        />
        {entry.basedOnId ? <Badge tone="neutral">Révision d&apos;une version précédente</Badge> : null}
      </Card>
    </PageStack>
  );
}
