import type { AdminDashboardData } from "../admin-api";
import { Badge, Card, Cluster } from "./admin-ui";
import { flagTone, sensitiveFeatureFlagKeys } from "./admin-view-models";

/**
 * Blocks shared by the admin home (`/`) and the platform dashboard (`/dashboard`) so the two
 * routes read the same way: what needs doing first, then the figures.
 */

/** Read-only state of the sensitive flags; the scope is shown when the flag is not global. */
export function SensitiveFlagsCard({ flags, ariaLabel }: { flags: AdminDashboardData["sensitiveFeatureFlags"]; ariaLabel?: string }) {
  return (
    <Card
      as="section"
      {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
      title="Feature flags sensibles (lecture seule)"
      description="Un module réglementé reste désactivé tant que la conformité n'a pas ouvert le flag par la procédure dédiée."
      footer={<a href="/feature-flags">Voir tous les feature flags</a>}
    >
      <Cluster>
        {sensitiveFeatureFlagKeys.map((key) => {
          const flag = flags.find((item) => item.key === key);
          const scope = flag && flag.scopeType !== "global" ? ` (${flag.scopeType}${flag.scopeId ? `:${flag.scopeId}` : ""})` : "";
          const active = flag?.value ?? false;
          return <Badge key={key} tone={flagTone(active)}>{key}{scope} : {active ? "actif" : "désactivé"}</Badge>;
        })}
      </Cluster>
    </Card>
  );
}
