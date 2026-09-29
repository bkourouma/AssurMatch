import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ActorContext } from "../../../src/modules/common/types";
import { actorHeaders, createRuntimeHttpHarness, readJson, type RuntimeHttpHarness } from "../runtime-http-test-utils";
import type { RoutingAnomalyReport } from "../../../../packages/shared/contracts/dashboard.contracts";
import type { AiInteraction } from "../../../../packages/shared/contracts/ai.contracts";

const superAdmin: ActorContext = { actorId: "super", roles: ["super_admin"], mfaVerified: true };
const unauthorizedBroker: ActorContext = { actorId: "broker-agent-1", roles: ["broker_agent"], mfaVerified: true, partnerTenantId: "partner-1" };

describe("Admin Routing Anomalies HTTP Endpoints", () => {
  let harness: RuntimeHttpHarness;

  beforeEach(async () => {
    harness = await createRuntimeHttpHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  describe("GET /admin/routing/anomalies", () => {
    it("returns 401 when no auth header is provided", async () => {
      const res = await harness.request("/admin/routing/anomalies");
      expect(res.status).toBe(401);
    });

    it("returns 403 when user is an unauthorized broker", async () => {
      const res = await harness.request("/admin/routing/anomalies", {
        headers: actorHeaders(unauthorizedBroker)
      });
      expect(res.status).toBe(403);
    });

    it("returns 200 with empty anomalies report when flag is disabled", async () => {
      const res = await harness.request("/admin/routing/anomalies", {
        headers: actorHeaders(superAdmin)
      });
      expect(res.status).toBe(200);
      const data = await readJson<RoutingAnomalyReport>(res);
      expect(data.totalAnomalies).toBe(0);
      expect(data.criticalCount).toBe(0);
      expect(data.anomalies).toEqual([]);
      expect(data.recommendations?.[0]).toContain("ai_routing_anomaly_detection_enabled=false");
    });

    it("returns 200 with report when flag is enabled", async () => {
      await harness.runtime.featureFlags.service.applyCompliancePolicy(
        { key: "ai_routing_anomaly_detection_enabled", scopeType: "global", value: true, reason: "integration test" },
        superAdmin,
        { reference: "POLICY-ANOMALY-INT", approvedBy: "compliance" }
      );

      const res = await harness.request("/admin/routing/anomalies", {
        headers: actorHeaders(superAdmin)
      });
      expect(res.status).toBe(200);
      const data = await readJson<RoutingAnomalyReport>(res);
      expect(data.generatedAt).toBeDefined();
      expect(typeof data.totalAnomalies).toBe("number");
      expect(Array.isArray(data.anomalies)).toBe(true);
    });
  });

  describe("POST /admin/routing/anomalies/analyze", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await harness.request("/admin/routing/anomalies/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(401);
    });

    it("returns 403 when broker calls analyze", async () => {
      const res = await harness.request("/admin/routing/anomalies/analyze", {
        method: "POST",
        headers: { ...actorHeaders(unauthorizedBroker), "content-type": "application/json" },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(403);
    });

    it("refuses with fail-closed status when flag is disabled", async () => {
      const res = await harness.request("/admin/routing/anomalies/analyze", {
        method: "POST",
        headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(201);
      const data = await readJson<AiInteraction>(res);
      expect(data.status).toBe("refused");
      expect(data.refusalReason).toContain("disabled");
    });

    it("returns queued interaction when flag is enabled", async () => {
      await harness.runtime.featureFlags.service.applyCompliancePolicy(
        { key: "ai_routing_anomaly_detection_enabled", scopeType: "global", value: true, reason: "integration test" },
        superAdmin,
        { reference: "POLICY-ANOMALY-INT-AI", approvedBy: "compliance" }
      );

      const res = await harness.request("/admin/routing/anomalies/analyze", {
        method: "POST",
        headers: { ...actorHeaders(superAdmin), "content-type": "application/json" },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(201);
      const data = await readJson<AiInteraction>(res);
      expect(data.assistType).toBe("routing_anomaly_analysis");
      expect(data.status).toBe("queued");
    });
  });
});
