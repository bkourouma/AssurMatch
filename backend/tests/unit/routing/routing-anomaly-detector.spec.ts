import { describe, expect, it } from "vitest";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { RoutingAuditActions } from "../../../src/modules/routing/routing-audit-actions";
import {
  RoutingAnomalyDetectorService,
  type RoutingAnomalyAssignmentItem,
  type RoutingAnomalyDecisionItem,
  type RoutingAnomalyQuoteItem
} from "../../../src/modules/routing/routing-anomaly-detector.service";
import type { ActorContext } from "../../../src/modules/common/types";

const superAdmin: ActorContext = { actorId: "admin-1", roles: ["super_admin"], mfaVerified: true };
const countryAdminCI: ActorContext = {
  actorId: "admin-ci",
  roles: ["admin_pays"],
  mfaVerified: true,
  countryScopes: ["country-ci", "CI"]
};
const unauthorizedUser: ActorContext = { actorId: "user-1", roles: ["broker_agent" as any], mfaVerified: true };

describe("RoutingAnomalyDetectorService", () => {
  const baseTime = new Date("2026-09-29T12:00:00.000Z");

  function createService(overrides?: {
    quotes?: RoutingAnomalyQuoteItem[];
    assignments?: RoutingAnomalyAssignmentItem[];
    decisions?: RoutingAnomalyDecisionItem[];
    countries?: Array<{ id: string; isoCode: string }>;
    flagEnabled?: boolean;
  }) {
    const audit = new AuditLogWriter();
    const quotes = overrides?.quotes ?? [];
    const assignments = overrides?.assignments ?? [];
    const decisions = overrides?.decisions ?? [];
    const countries = overrides?.countries ?? [{ id: "country-ci", isoCode: "CI" }, { id: "country-sn", isoCode: "SN" }];
    const flagEnabled = overrides?.flagEnabled ?? true;

    const detector = new RoutingAnomalyDetectorService({
      quoteRequests: { list: async () => quotes },
      leadAssignments: { list: async () => assignments },
      routingDecisions: { list: async () => decisions },
      countries: { listAdmin: async () => countries },
      featureFlags: { isEnabled: () => flagEnabled },
      audit,
      now: () => baseTime
    });

    return { detector, audit };
  }

  it("returns empty report when feature flag is disabled", async () => {
    const { detector } = createService({
      flagEnabled: false,
      quotes: [
        {
          id: "q-1",
          countryId: "country-ci",
          productId: "auto",
          status: "created",
          routingStatus: "blocked",
          createdAt: new Date(baseTime.getTime() - 90 * 60 * 1000)
        }
      ]
    });

    const report = await detector.detectAnomalies(superAdmin);
    expect(report.totalAnomalies).toBe(0);
    expect(report.criticalCount).toBe(0);
    expect(report.recommendations?.[0]).toContain("ai_routing_anomaly_detection_enabled=false");
  });

  it("detects blocked and orphan leads with appropriate severity and raises compliance alert", async () => {
    const quotes: RoutingAnomalyQuoteItem[] = [
      {
        id: "q-blocked",
        publicReference: "REF-BLOCKED",
        countryId: "country-ci",
        productId: "auto",
        status: "created",
        routingStatus: "blocked",
        createdAt: new Date(baseTime.getTime() - 10 * 60 * 1000) // 10 min ago
      },
      {
        id: "q-pending-warning",
        publicReference: "REF-PENDING-WARN",
        countryId: "country-ci",
        productId: "auto",
        status: "created",
        routingStatus: "pending_manual_assignment",
        createdAt: new Date(baseTime.getTime() - 25 * 60 * 1000) // 25 min ago
      },
      {
        id: "q-pending-critical",
        publicReference: "REF-PENDING-CRIT",
        countryId: "country-ci",
        productId: "auto",
        status: "created",
        routingStatus: "pending_manual_assignment",
        createdAt: new Date(baseTime.getTime() - 75 * 60 * 1000) // 75 min ago
      },
      {
        id: "q-ok",
        countryId: "country-ci",
        productId: "auto",
        status: "transmitted",
        routingStatus: "assigned",
        createdAt: new Date(baseTime.getTime() - 5 * 60 * 1000)
      }
    ];

    const { detector, audit } = createService({ quotes });
    const report = await detector.detectAnomalies(superAdmin);

    expect(report.totalAnomalies).toBe(3);
    const blockedAnomaly = report.anomalies.find((a) => a.targetId === "q-blocked");
    expect(blockedAnomaly?.severity).toBe("critical");
    expect(blockedAnomaly?.type).toBe("unassigned_leads");

    const warnAnomaly = report.anomalies.find((a) => a.targetId === "q-pending-warning");
    expect(warnAnomaly?.severity).toBe("warning");

    const critAnomaly = report.anomalies.find((a) => a.targetId === "q-pending-critical");
    expect(critAnomaly?.severity).toBe("critical");

    // Verify compliance alert raised for critical items
    const alertEntries = audit.all().filter((e) => e.action === RoutingAuditActions.anomalyAlertRaised);
    expect(alertEntries.length).toBe(2);
    expect(alertEntries[0]?.result).toBe("refused");
    expect(alertEntries[0]?.reason).toContain("routing_anomaly");
  });

  it("detects SLA breach risks for assignments without broker action", async () => {
    const quotes: RoutingAnomalyQuoteItem[] = [
      { id: "q-1", countryId: "country-ci", productId: "health", status: "transmitted", routingStatus: "assigned", createdAt: baseTime }
    ];

    const assignments: RoutingAnomalyAssignmentItem[] = [
      {
        id: "as-warning",
        quoteRequestId: "q-1",
        partnerTenantId: "partner-alpha",
        status: "assigned",
        assignedAt: new Date(baseTime.getTime() - 45 * 60 * 1000), // 45m ago -> warning
        lastBrokerActionAt: null
      },
      {
        id: "as-critical",
        quoteRequestId: "q-1",
        partnerTenantId: "partner-beta",
        status: "broker_notified",
        assignedAt: new Date(baseTime.getTime() - 150 * 60 * 1000), // 2.5h ago -> critical
        lastBrokerActionAt: null
      },
      {
        id: "as-acted",
        quoteRequestId: "q-1",
        partnerTenantId: "partner-gamma",
        status: "accepted",
        assignedAt: new Date(baseTime.getTime() - 60 * 60 * 1000),
        acceptedAt: new Date(baseTime.getTime() - 50 * 60 * 1000),
        lastBrokerActionAt: new Date(baseTime.getTime() - 50 * 60 * 1000)
      }
    ];

    const { detector } = createService({ quotes, assignments });
    const report = await detector.detectAnomalies(superAdmin);

    const slaAnomalies = report.anomalies.filter((a) => a.type === "sla_breach_risk");
    expect(slaAnomalies.length).toBe(2);
    expect(slaAnomalies.find((a) => a.targetId === "as-warning")?.severity).toBe("warning");
    expect(slaAnomalies.find((a) => a.targetId === "as-critical")?.severity).toBe("critical");
  });

  it("detects quota saturation from routing decisions", async () => {
    const quotes: RoutingAnomalyQuoteItem[] = [
      { id: "q-sat", publicReference: "REF-QUOTA", countryId: "country-ci", productId: "auto", status: "created", routingStatus: "no_broker_available", createdAt: baseTime }
    ];
    const decisions: RoutingAnomalyDecisionItem[] = [
      {
        id: "dec-1",
        quoteRequestId: "q-sat",
        result: "no_broker_available",
        candidateCount: 0,
        reasons: ["monthly_quota_reached"],
        createdAt: baseTime
      }
    ];

    const { detector } = createService({ quotes, decisions });
    const report = await detector.detectAnomalies(superAdmin);

    const quotaAnomaly = report.anomalies.find((a) => a.type === "quota_saturation");
    expect(quotaAnomaly).toBeDefined();
    expect(quotaAnomaly?.severity).toBe("critical");
    expect(quotaAnomaly?.details).toContain("monthly_quota_reached");
  });

  it("detects distribution skew when single partner receives >= 80% of leads", async () => {
    const quotes: RoutingAnomalyQuoteItem[] = Array.from({ length: 6 }).map((_, i) => ({
      id: `q-${i}`,
      countryId: "country-ci",
      productId: "auto",
      status: "transmitted",
      routingStatus: "assigned",
      createdAt: baseTime
    }));

    // 5 to partner-dominant (83.3%), 1 to partner-minor
    const assignments: RoutingAnomalyAssignmentItem[] = quotes.map((q, i) => ({
      id: `as-${i}`,
      quoteRequestId: q.id,
      partnerTenantId: i < 5 ? "partner-dominant" : "partner-minor",
      status: "accepted",
      assignedAt: baseTime,
      lastBrokerActionAt: baseTime
    }));

    const { detector } = createService({ quotes, assignments });
    const report = await detector.detectAnomalies(superAdmin);

    const skewAnomaly = report.anomalies.find((a) => a.type === "distribution_skew");
    expect(skewAnomaly).toBeDefined();
    expect(skewAnomaly?.severity).toBe("warning");
    expect(skewAnomaly?.targetId).toBe("partner-dominant");
    expect(skewAnomaly?.details).toContain("83%");
  });

  it("guarantees Zero PII: only technical references and counts are present", async () => {
    const quotes: RoutingAnomalyQuoteItem[] = [
      {
        id: "q-pii-check",
        publicReference: "DEV-2026-ABC",
        countryId: "country-ci",
        productId: "auto",
        status: "created",
        routingStatus: "blocked",
        createdAt: new Date(baseTime.getTime() - 20 * 60 * 1000)
      }
    ];

    const { detector } = createService({ quotes });
    const report = await detector.detectAnomalies(superAdmin);

    const rawReport = JSON.stringify(report);
    expect(rawReport).not.toContain("@"); // no emails
    expect(rawReport).not.toContain("+225"); // no phone
    expect(rawReport).not.toContain("Kouassi"); // no names
  });

  it("filters anomalies according to actor country scopes", async () => {
    const quotes: RoutingAnomalyQuoteItem[] = [
      { id: "q-ci", countryId: "country-ci", productId: "auto", status: "created", routingStatus: "blocked", createdAt: baseTime },
      { id: "q-sn", countryId: "country-sn", productId: "auto", status: "created", routingStatus: "blocked", createdAt: baseTime }
    ];

    const { detector } = createService({ quotes });
    const report = await detector.detectAnomalies(countryAdminCI);

    expect(report.totalAnomalies).toBe(1);
    expect(report.anomalies[0]?.country).toBe("CI");
  });

  it("refuses unauthorized actor without proper role or MFA", async () => {
    const { detector } = createService({});
    await expect(detector.detectAnomalies(unauthorizedUser)).rejects.toThrow("forbidden_role");

    const noMfaAdmin: ActorContext = { actorId: "super", roles: ["super_admin"], mfaVerified: false };
    await expect(detector.detectAnomalies(noMfaAdmin)).rejects.toThrow("mfa_required");
  });
});
