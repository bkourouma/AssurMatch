import { redirect } from "next/navigation";
import { readAdminFeatureFlags, type AdminFeatureFlagData } from "../lib/admin-api";
import { isAdminProfile, loginRedirect, readBackOfficeSession } from "../lib/backoffice-auth";
import { adminReadErrorMessage, formatDate, isSensitiveFlagKey } from "../lib/catalog-messages";
import { Badge, Button, Card, DataTable, PageHeader, PageStack, StateMessage } from "../lib/ui/admin-ui";
import { sensitiveFeatureFlagKeys } from "../lib/ui/admin-view-models";
import { GlobalFlagToggleForm } from "./feature-flag-forms";

function isSensitive(flag: Pick<AdminFeatureFlagData, "key">): boolean {
  return isSensitiveFlagKey(flag.key, sensitiveFeatureFlagKeys);
}

function scopeHref(flag: AdminFeatureFlagData): string {
  if (flag.scopeType === "country" && flag.scopeId) return `/catalog/countries/${encodeURIComponent(flag.scopeId)}`;
  if (flag.scopeType === "product" && flag.scopeId) return `/catalog/products/${encodeURIComponent(flag.scopeId)}`;
  return "/catalog";
}

function ValueBadge({ value }: { value: boolean }) {
  return <Badge tone={value ? "warning" : "disabled"}>{value ? "Actif" : "Desactive"}</Badge>;
}

export default async function FeatureFlagsPage() {
  const session = await readBackOfficeSession();
  if (session.status === "unauthenticated" || session.status === "expired") redirect(loginRedirect("/feature-flags", session.status));
  if (session.status === "mfa_required") redirect(`/mfa?returnTo=${encodeURIComponent("/feature-flags")}`);
  if (session.status !== "authenticated" || !isAdminProfile(session.profile)) redirect("/login?error=access_denied&returnTo=%2Ffeature-flags");

  const flags = await readAdminFeatureFlags();
  if (flags.unauthenticated) redirect(loginRedirect("/feature-flags", flags.error ?? "session_required"));
  const globalFlags = flags.data.filter((flag) => flag.scopeType === "global");
  const toggleable = globalFlags.filter((flag) => !isSensitive(flag));
  const sensitiveGlobal = globalFlags.filter(isSensitive);
  const scoped = flags.data.filter((flag) => flag.scopeType !== "global");
  const listedSensitiveKeys = new Set(sensitiveGlobal.map((flag) => flag.key));
  const referenceOnlyKeys = sensitiveFeatureFlagKeys.filter((key) => !listedSensitiveKeys.has(key));

  return (
    <PageStack>
      <PageHeader
        breadcrumb={[{ label: "Plateforme" }, { label: "Feature flags" }]}
        kicker="Activation progressive"
        title="Feature flags"
        description="Vue de pilotage des flags globaux, pays, produits, partenaires et modules. Les modules sensibles restent fail-closed et auditables."
      />

      {flags.forbidden ? <StateMessage tone="danger">{adminReadErrorMessage("access_denied")}</StateMessage> : null}
      {flags.status === "error" ? <StateMessage tone="danger">{adminReadErrorMessage(flags.error)}</StateMessage> : null}

      <Card
        title="Desactivation rapide"
        description="Les flags globaux, pays, produits, partenaires et modules restent auditables et fail-closed. Seuls les flags globaux non sensibles se basculent ici, avec un motif audite."
      >
        <DataTable
          columns={[
            { key: "flag", header: "Flag", render: (flag) => <code>{flag.key}</code> },
            { key: "value", header: "Etat", render: (flag) => <ValueBadge value={flag.value} /> },
            { key: "changed", header: "Modifie le", render: (flag) => formatDate(flag.changedAt) },
            { key: "reason", header: "Dernier motif", render: (flag) => flag.reason ?? "-" },
            { key: "action", header: "Action", render: (flag) => <GlobalFlagToggleForm flagId={flag.id} flagKey={flag.key} currentValue={flag.value} /> }
          ]}
          items={toggleable}
          getKey={(flag) => flag.id}
          emptyLabel="Aucun flag global non sensible."
          aria-label="Flags globaux non sensibles"
        />
      </Card>

      <Card title="Modules sensibles (lecture seule)" description="Flags reglementes, IA, paiement, signature, sinistres, assureurs et webhooks : aucune bascule depuis cette interface.">
        <DataTable
          columns={[
            { key: "flag", header: "Flag", render: (flag) => <code>{flag.key}</code> },
            { key: "value", header: "Etat", render: (flag) => <ValueBadge value={flag.value} /> },
            { key: "control", header: "Controle", render: () => "Aucune activation par cette interface : procedure de conformite" }
          ]}
          items={sensitiveGlobal}
          getKey={(flag) => flag.id}
          emptyLabel="Aucun flag sensible enregistre."
          aria-label="Modules sensibles"
        />
        {referenceOnlyKeys.length > 0 ? (
          <p className="bo-description">
            {`Flags sensibles de reference non enregistres (donc desactives, fail-closed) : ${referenceOnlyKeys.join(", ")}.`}
          </p>
        ) : null}
      </Card>

      <Card title="Flags pays et produits (lecture seule)" description="Historique ecrit par le catalogue. Ils se modifient depuis les fiches pays et produits, ou leurs conditions d'activation s'appliquent.">
        <DataTable
          columns={[
            { key: "flag", header: "Flag", render: (flag) => <code>{flag.key}</code> },
            { key: "scope", header: "Portee", render: (flag) => `${flag.scopeType}${flag.scopeId ? ` ${flag.scopeId.slice(0, 8)}` : ""}` },
            { key: "value", header: "Etat", render: (flag) => <ValueBadge value={flag.value} /> },
            { key: "link", header: "", render: (flag) => <Button href={scopeHref(flag)} size="sm" variant="secondary">Ouvrir dans le catalogue</Button> }
          ]}
          items={scoped}
          getKey={(flag) => flag.id}
          emptyLabel="Aucun flag pays ou produit enregistre."
          aria-label="Flags pays et produits"
        />
      </Card>

      <StateMessage tone="warning">Cette interface ne cree aucun bouton d&apos;activation pour les modules reglementes.</StateMessage>
    </PageStack>
  );
}
