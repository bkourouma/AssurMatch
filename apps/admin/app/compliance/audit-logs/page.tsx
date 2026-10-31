import { readBackOfficeSession } from "../../lib/backoffice-auth";
import { firstValue, formatDateTime, pageHref, pageNumber, readAuditLogs, toQueryString, type AuditLogRow } from "../../lib/operations-api";
import { Badge, Button, DataTable, Field, FilterBar, Input, PageHeader, PageStack, Select, StateMessage, fieldControlProps, type DataTableColumn } from "../../lib/ui/admin-ui";
import { auditResultTones } from "../../lib/ui/operations-tones";

/**
 * Spec 056 (H-05): audit-log search over the durable store (actor, action prefix, target, result,
 * period) with pagination. The CSV export is restricted to compliance and super admins, capped and
 * itself audited by the API. Contexts are shown as stored: PII was masked when they were written.
 */

const EXPORT_ROLES = new Set(["super_admin", "compliance_admin"]);

const columns: Array<DataTableColumn<AuditLogRow>> = [
  { key: "date", header: "Date", render: (row) => formatDateTime(row.occurredAt) },
  { key: "actor", header: "Acteur", render: (row) => (row.actorId ? <span className="bo-ref">{row.actorId.slice(0, 12)}</span> : "système / visiteur") },
  { key: "action", header: "Action", render: (row) => <span className="bo-ref">{row.action}</span> },
  { key: "target", header: "Cible", render: (row) => <>{row.targetType} <span className="bo-ref">{row.targetId.slice(0, 12)}</span></> },
  { key: "result", header: "Résultat", render: (row) => <Badge tone={auditResultTones[row.result] ?? "neutral"}>{row.result}</Badge> },
  { key: "reason", header: "Motif", render: (row) => row.reason ?? "-" },
  { key: "correlation", header: "Corrélation", render: (row) => (row.correlationId ? <span className="bo-ref">{row.correlationId.slice(0, 12)}</span> : "-") },
  { key: "context", header: "Contexte", render: (row) => <code>{JSON.stringify(row.context).slice(0, 160)}</code> }
];

export default async function AdminAuditLogsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : {};
  const filters = {
    actorId: firstValue(params.actorId),
    action: firstValue(params.action),
    targetType: firstValue(params.targetType),
    targetId: firstValue(params.targetId),
    result: firstValue(params.result),
    from: firstValue(params.from),
    to: firstValue(params.to)
  };
  const page = pageNumber(params.page);
  const [result, session] = await Promise.all([readAuditLogs({ ...filters, page, pageSize: 50 }), readBackOfficeSession()]);
  const canExport = session.status === "authenticated" && session.profile.roles.some((role) => EXPORT_ROLES.has(role));

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Pilotage" }, { label: "Conformité", href: "/compliance" }, { label: "Journaux d'audit" }]}
        title="Journaux d'audit"
        description="Recherche dans le journal opposable par acteur, action, cible, résultat et période. Chaque recherche et chaque export sont eux-mêmes journalisés."
        actions={canExport ? <Button href={`/compliance/audit-logs/export${toQueryString(filters)}`} variant="secondary">Exporter en CSV (5 000 lignes max)</Button> : undefined}
      />

      {result.status === "unauthenticated" ? <StateMessage tone="danger">Session admin requise.</StateMessage> : null}
      {result.status === "forbidden" ? <StateMessage tone="danger">Journaux d'audit non accessibles pour ce rôle admin.</StateMessage> : null}
      {result.status === "error" ? <StateMessage tone="danger">Journaux indisponibles : {result.error}</StateMessage> : null}
      {!canExport ? <StateMessage>Export réservé à la conformité et au Super Admin.</StateMessage> : null}

      <FilterBar action="/compliance/audit-logs" label="Filtres journaux d'audit" submitLabel="Rechercher" resetLabel="Réinitialiser" resetHref="/compliance/audit-logs" activeCount={Object.values(filters).filter(Boolean).length}>
        <Field id="al-actor" label="Acteur (identifiant)">
          <Input {...fieldControlProps("al-actor")} name="actorId" defaultValue={filters.actorId ?? ""} />
        </Field>
        <Field id="al-action" label="Action (préfixe)">
          <Input {...fieldControlProps("al-action")} name="action" defaultValue={filters.action ?? ""} placeholder="quote_request" />
        </Field>
        <Field id="al-target-type" label="Type de cible">
          <Input {...fieldControlProps("al-target-type")} name="targetType" defaultValue={filters.targetType ?? ""} placeholder="QuoteRequest" />
        </Field>
        <Field id="al-target-id" label="Identifiant de cible">
          <Input {...fieldControlProps("al-target-id")} name="targetId" defaultValue={filters.targetId ?? ""} />
        </Field>
        <Field id="al-result" label="Résultat">
          <Select {...fieldControlProps("al-result")} name="result" defaultValue={filters.result ?? ""}>
            <option value="">Tous</option>
            <option value="success">success</option>
            <option value="refused">refused</option>
            <option value="failed">failed</option>
          </Select>
        </Field>
        <Field id="al-from" label="Du">
          <Input {...fieldControlProps("al-from")} name="from" type="date" defaultValue={filters.from ?? ""} />
        </Field>
        <Field id="al-to" label="Au">
          <Input {...fieldControlProps("al-to")} name="to" type="date" defaultValue={filters.to ?? ""} />
        </Field>
      </FilterBar>

      <DataTable
        columns={columns}
        items={result.data.items}
        getKey={(row) => row.id}
        emptyLabel="Aucune entrée pour ces filtres."
        emptyDescription="Élargissez la période ou raccourcissez le préfixe d'action."
        aria-label="Journal d'audit"
        dense
        pagination={{
          page,
          pageSize: result.data.pageSize,
          total: result.data.total,
          hrefFor: (target) => pageHref("/compliance/audit-logs", filters, target),
          label: (from, to, total) => `${from}-${to} sur ${total} entrées`
        }}
      />
    </PageStack>
  );
}
