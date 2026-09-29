import { randomUUID } from "node:crypto";
import { roleHasPermission } from "../../../../packages/shared/rbac/assurmatch-role-matrix";
import type {
  RoutingAnomalyItem,
  RoutingAnomalyReport,
  RoutingAnomalySeverity
} from "../../../../packages/shared/contracts/dashboard.contracts";
import type { ActorContext } from "../common/types";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { RoutingAuditActions } from "./routing-audit-actions";

export interface RoutingAnomalyQuoteItem {
  id: string;
  publicReference?: string;
  countryId: string;
  countryCode?: string;
  productId: string;
  productKey?: string;
  status: string;
  routingStatus: string;
  createdAt: Date;
}

export interface RoutingAnomalyAssignmentItem {
  id: string;
  quoteRequestId: string;
  partnerTenantId: string;
  status: string;
  assignedAt: Date;
  lastBrokerActionAt?: Date | null;
  acceptedAt?: Date | null;
  contactedAt?: Date | null;
  rejectedAt?: Date | null;
}

export interface RoutingAnomalyRuleItem {
  id: string;
  countryId: string;
  productId?: string | null;
  status: string;
  mode: string;
  maxRecipients: number;
}

export interface RoutingAnomalyDecisionItem {
  id: string;
  quoteRequestId: string;
  result: string;
  selectedPartnerTenantId?: string | null;
  selectedPartnerTenantIds?: string[];
  candidateCount: number;
  reasons: string[];
  createdAt: Date;
}

export interface RoutingAnomalyDetectorDeps {
  quoteRequests: {
    list(): Promise<RoutingAnomalyQuoteItem[]>;
  };
  leadAssignments: {
    list(): Promise<RoutingAnomalyAssignmentItem[]>;
  };
  routingRules?: {
    listRules(): Promise<RoutingAnomalyRuleItem[]>;
  };
  routingDecisions?: {
    list(): Promise<RoutingAnomalyDecisionItem[]>;
  };
  countries?: {
    listAdmin(): Promise<Array<{ id: string; isoCode: string }>>;
  };
  featureFlags?: {
    isEnabled(flagKey: string): Promise<boolean> | boolean;
  };
  audit: AuditLogWriter;
  now?: () => Date;
}

export class RoutingAnomalyDetectorService {
  constructor(private readonly deps: RoutingAnomalyDetectorDeps) {}

  async detectAnomalies(
    actor: ActorContext,
    _options?: { from?: string | undefined; to?: string | undefined }
  ): Promise<RoutingAnomalyReport> {
    this.assertAccess(actor);

    const now = this.deps.now ? this.deps.now() : new Date();

    const isEnabled = this.deps.featureFlags
      ? await this.deps.featureFlags.isEnabled("ai_routing_anomaly_detection_enabled")
      : true;

    if (!isEnabled) {
      return {
        generatedAt: now.toISOString(),
        totalAnomalies: 0,
        criticalCount: 0,
        warningCount: 0,
        anomalies: [],
        recommendations: [
          "Detection d'anomalies de routage desactivee (feature flag ai_routing_anomaly_detection_enabled=false)."
        ]
      };
    }

    const [allQuotes, allAssignments, allDecisions, allCountries] = await Promise.all([
      this.deps.quoteRequests.list(),
      this.deps.leadAssignments.list(),
      this.deps.routingDecisions ? this.deps.routingDecisions.list() : Promise.resolve([]),
      this.deps.countries ? this.deps.countries.listAdmin() : Promise.resolve([])
    ]);

    const countryMap = new Map(allCountries.map((c) => [c.id, c.isoCode]));

    // Scope filtering for country admins
    const quotes = allQuotes.filter((quote) => this.scopeAllows(actor, quote.countryId, countryMap.get(quote.countryId)));
    const quoteIdMap = new Map(quotes.map((q) => [q.id, q]));
    const assignments = allAssignments.filter((a) => {
      const q = quoteIdMap.get(a.quoteRequestId);
      return Boolean(q);
    });

    const anomalies: RoutingAnomalyItem[] = [];

    // 1. Unassigned / blocked leads
    for (const quote of quotes) {
      const elapsedMinutes = (now.getTime() - quote.createdAt.getTime()) / (60 * 1000);
      const isBlocked = quote.routingStatus === "blocked" || quote.routingStatus === "no_broker_available";
      const isPendingManual =
        quote.routingStatus === "pending_manual_assignment" || quote.routingStatus === "manual_review_required";
      const isUnassigned = quote.routingStatus !== "assigned";
      const country = quote.countryCode ?? countryMap.get(quote.countryId);
      const product = quote.productKey ?? quote.productId;

      if (isBlocked) {
        anomalies.push({
          id: randomUUID(),
          type: "unassigned_leads",
          severity: "critical",
          detectedAt: now.toISOString(),
          ...(country ? { country } : {}),
          ...(product ? { product } : {}),
          targetId: quote.id,
          details: `Lead ${quote.publicReference ?? quote.id} non route (statut: ${quote.routingStatus}). Aucun courtier eligible.`,
          metricValue: Math.round(elapsedMinutes),
          metricThreshold: 0
        });
      } else if (isPendingManual && elapsedMinutes >= 15) {
        const severity: RoutingAnomalySeverity = elapsedMinutes >= 60 ? "critical" : "warning";
        anomalies.push({
          id: randomUUID(),
          type: "unassigned_leads",
          severity,
          detectedAt: now.toISOString(),
          ...(country ? { country } : {}),
          ...(product ? { product } : {}),
          targetId: quote.id,
          details: `Lead ${quote.publicReference ?? quote.id} en attente d'assignation manuelle depuis ${Math.floor(elapsedMinutes)} minutes.`,
          metricValue: Math.round(elapsedMinutes),
          metricThreshold: severity === "critical" ? 60 : 15
        });
      } else if (isUnassigned && elapsedMinutes >= 30) {
        const severity: RoutingAnomalySeverity = elapsedMinutes >= 60 ? "critical" : "warning";
        anomalies.push({
          id: randomUUID(),
          type: "unassigned_leads",
          severity,
          detectedAt: now.toISOString(),
          ...(country ? { country } : {}),
          ...(product ? { product } : {}),
          targetId: quote.id,
          details: `Lead ${quote.publicReference ?? quote.id} orphelin non assigne depuis ${Math.floor(elapsedMinutes)} minutes.`,
          metricValue: Math.round(elapsedMinutes),
          metricThreshold: severity === "critical" ? 60 : 30
        });
      }
    }

    // 2. SLA breach risk
    for (const assignment of assignments) {
      const isPendingBrokerAction =
        ["assigned", "broker_notified", "seen"].includes(assignment.status) &&
        !assignment.lastBrokerActionAt &&
        !assignment.acceptedAt &&
        !assignment.contactedAt &&
        !assignment.rejectedAt;

      if (isPendingBrokerAction) {
        const elapsedMinutes = (now.getTime() - assignment.assignedAt.getTime()) / (60 * 1000);
        if (elapsedMinutes >= 30) {
          const severity: RoutingAnomalySeverity = elapsedMinutes >= 120 ? "critical" : "warning";
          const quote = quoteIdMap.get(assignment.quoteRequestId);
          const country = quote ? (quote.countryCode ?? countryMap.get(quote.countryId)) : undefined;
          const product = quote ? (quote.productKey ?? quote.productId) : undefined;
          anomalies.push({
            id: randomUUID(),
            type: "sla_breach_risk",
            severity,
            detectedAt: now.toISOString(),
            ...(country ? { country } : {}),
            ...(product ? { product } : {}),
            targetId: assignment.id,
            details: `Lead assigne au courtier ${assignment.partnerTenantId} sans action depuis ${Math.floor(elapsedMinutes)} minutes (SLA).`,
            metricValue: Math.round(elapsedMinutes),
            metricThreshold: severity === "critical" ? 120 : 30
          });
        }
      }
    }

    // 3. Quota saturation
    for (const decision of allDecisions) {
      const quote = quoteIdMap.get(decision.quoteRequestId);
      if (!quote) continue;

      const hasQuotaReason = decision.reasons.some((r) => r.toLowerCase().includes("quota"));
      if (hasQuotaReason || (decision.candidateCount === 0 && decision.result === "no_broker_available")) {
        const country = quote.countryCode ?? countryMap.get(quote.countryId);
        const product = quote.productKey ?? quote.productId;
        anomalies.push({
          id: randomUUID(),
          type: "quota_saturation",
          severity: "critical",
          detectedAt: now.toISOString(),
          ...(country ? { country } : {}),
          ...(product ? { product } : {}),
          targetId: decision.id,
          details: `Saturation de quota detectee sur la demande ${quote.publicReference ?? quote.id} : aucun courtier disponible (${decision.reasons.join(", ")}).`,
          metricValue: 100,
          metricThreshold: 100
        });
      }
    }

    // 4. Distribution skew
    const grouped = new Map<string, { count: number; partnerCounts: Map<string, number>; countryId: string; productId: string }>();
    for (const assignment of assignments) {
      const quote = quoteIdMap.get(assignment.quoteRequestId);
      if (!quote) continue;
      const key = `${quote.countryId}:${quote.productId}`;
      let g = grouped.get(key);
      if (!g) {
        g = { count: 0, partnerCounts: new Map(), countryId: quote.countryId, productId: quote.productId };
        grouped.set(key, g);
      }
      g.count += 1;
      g.partnerCounts.set(assignment.partnerTenantId, (g.partnerCounts.get(assignment.partnerTenantId) ?? 0) + 1);
    }

    for (const [, group] of grouped) {
      if (group.count >= 5 && group.partnerCounts.size > 1) {
        for (const [partnerId, count] of group.partnerCounts) {
          const share = count / group.count;
          if (share >= 0.8) {
            const countryCode = countryMap.get(group.countryId) ?? group.countryId;
            anomalies.push({
              id: randomUUID(),
              type: "distribution_skew",
              severity: "warning",
              detectedAt: now.toISOString(),
              country: countryCode,
              product: group.productId,
              targetId: partnerId,
              details: `Desequilibre de distribution : le partenaire ${partnerId} a recu ${Math.round(share * 100)}% des leads (${count}/${group.count}) sur ${countryCode}/${group.productId}.`,
              metricValue: Math.round(share * 100),
              metricThreshold: 80
            });
          }
        }
      }
    }

    const criticalCount = anomalies.filter((a) => a.severity === "critical").length;
    const warningCount = anomalies.filter((a) => a.severity === "warning").length;

    // Raise compliance alerts for critical anomalies
    for (const critical of anomalies.filter((a) => a.severity === "critical")) {
      this.deps.audit.write({
        actor,
        action: RoutingAuditActions.anomalyAlertRaised,
        targetType: "RoutingAnomaly",
        targetId: critical.id,
        scope: {
          countryId: critical.country,
          productId: critical.product,
          roles: actor.roles
        },
        result: "refused",
        reason: `routing_anomaly: ${critical.type} (${critical.severity}) - ${critical.details}`,
        context: {
          anomalyType: critical.type,
          severity: critical.severity,
          metricValue: critical.metricValue,
          metricThreshold: critical.metricThreshold
        }
      });
    }

    // Audit the anomaly detection action
    this.deps.audit.write({
      actor,
      action: RoutingAuditActions.anomalyDetected,
      targetType: "RoutingAnomalyReport",
      targetId: "report",
      scope: { roles: actor.roles },
      result: "success",
      context: {
        totalAnomalies: anomalies.length,
        criticalCount,
        warningCount
      }
    });

    const recommendations: string[] = [];
    if (criticalCount > 0) {
      recommendations.push(
        `${criticalCount} anomalie(s) critique(s) detectee(s). Verifiez d'urgence les quotas et les courtiers indisponibles.`
      );
    }
    if (anomalies.some((a) => a.type === "sla_breach_risk")) {
      recommendations.push(
        "Des retards de premier contact (> 30 min) ont ete detectes. Relancez les courtiers concernes."
      );
    }
    if (anomalies.some((a) => a.type === "distribution_skew")) {
      recommendations.push(
        "Un desequilibre de distribution a ete identifie. Ajustez les priorites et capacites dans les regles de routage."
      );
    }
    if (recommendations.length === 0) {
      recommendations.push("Aucune anomalie critique. Le routage fonctionne dans les seuils nominaux.");
    }

    return {
      generatedAt: now.toISOString(),
      totalAnomalies: anomalies.length,
      criticalCount,
      warningCount,
      anomalies,
      recommendations
    };
  }

  private assertAccess(actor: ActorContext): void {
    if (actor.mfaVerified !== true) this.refuse(actor, "mfa_required");
    const isAuthorizedRole =
      actor.roles.some((role) =>
        roleHasPermission(role, "routing_rules:read") ||
        roleHasPermission(role, "lead_assignments:read") ||
        role === "super_admin" ||
        role === "admin_pays" ||
        role === "compliance_admin" ||
        role === "support_admin"
      );
    if (!isAuthorizedRole) this.refuse(actor, "forbidden_role");
  }

  private scopeAllows(actor: ActorContext, countryId: string, isoCode?: string): boolean {
    if (actor.roles.includes("super_admin")) return true;
    if (!actor.countryScopes?.length) return true;
    return actor.countryScopes.includes(countryId) || (Boolean(isoCode) && actor.countryScopes.includes(isoCode!));
  }

  private refuse(actor: ActorContext, reason: string): never {
    this.deps.audit.write({
      actor,
      action: RoutingAuditActions.anomalyDetected,
      targetType: "RoutingAnomalyReport",
      targetId: "report",
      result: "refused",
      reason,
      scope: { roles: actor.roles }
    });
    throw new Error(`Routing anomaly detection refused: ${reason}`);
  }
}
