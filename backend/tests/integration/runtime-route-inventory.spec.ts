import { afterEach, describe, expect, it } from "vitest";
import { PATH_METADATA } from "@nestjs/common/constants";
import { AppModule } from "../../src/app.module";
import {
  AdminAuditLogsController,
  AdminContactMessagesController,
  AdminFeatureFlagsController,
  AdminHealthController,
  AdminPartnerApplicationsController,
  AuthController,
  BrokerCrmController,
  BrokerStarterController,
  PublicContactController,
  PublicCountriesController,
  PublicInsurersController,
  PublicOffersController,
  PublicPartnerDirectoryController,
  PublicPartnersController,
  PublicProductsController,
  PublicQuoteRequestsController,
  PublicStatsController,
  PublicWaitlistController,
  RuntimeHttpWiringModule
} from "../../src/modules/http-wiring/runtime-http-wiring.module";
import { RuntimeHttpController } from "../../src/runtime/runtime-http.controller";
import { createRuntimeHttpHarness, type RuntimeHttpHarness } from "./runtime-http-test-utils";

describe("runtime HTTP route inventory", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("exposes public auth broker CRM admin and health route groups through Nest HTTP", async () => {
    harness = await createRuntimeHttpHarness();

    const checks = [
      ["/countries", 200],
      ["/auth/me", 401],
      ["/broker/starter/leads", 401],
      ["/broker/crm/leads", 401],
      ["/admin/audit-logs", 401],
      ["/admin/system/health", 401]
    ] as const;

    for (const [path, status] of checks) {
      const response = await harness.request(path);
      expect(response.status, path).toBe(status);
    }
  });

  it("exposes the spec 045 public site routes and keeps the admin reads behind authentication", async () => {
    harness = await createRuntimeHttpHarness();

    const checks = [
      // `directory` must resolve to the country directory, never be captured as a country code.
      ["/countries/directory", 200],
      ["/public-stats", 200],
      ["/admin/partners/applications", 401],
      ["/admin/contact-messages", 401]
    ] as const;

    for (const [path, status] of checks) {
      const response = await harness.request(path);
      expect(response.status, path).toBe(status);
    }

    // An unseeded country is refused rather than 404-on-unknown-route: the routes exist.
    for (const path of ["/countries/CI/partners", "/countries/CI/partners/00000000-0000-4000-8000-000000000099", "/countries/CI/insurers"]) {
      const response = await harness.request(path);
      expect(response.status, path).toBe(404);
      expect(await response.json(), path).toMatchObject({ message: "Country is not publicly available" });
    }

    const posts = [
      ["/waitlist", 400],
      ["/contact", 400],
      ["/partners/applications", 400]
    ] as const;
    for (const [path, status] of posts) {
      const response = await harness.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      expect(response.status, path).toBe(status);
    }

    const plans = await harness.request("/partners/plans?country=CI");
    expect(plans.status).toBe(404);

    const withdrawal = await harness.request("/quote-requests/QR-UNKNOWN/consent-withdrawal?token=nope", { method: "POST" });
    expect(withdrawal.status).toBe(404);
  });

  it("uses the runtime HTTP wiring module instead of registering RuntimeHttpController in AppModule", async () => {
    const appImports = Reflect.getMetadata("imports", AppModule) as unknown[];
    const appControllers = (Reflect.getMetadata("controllers", AppModule) as unknown[] | undefined) ?? [];

    expect(appImports).toContain(RuntimeHttpWiringModule);
    expect(appControllers).not.toContain(RuntimeHttpController);
  });

  it("declares decorated P1 domain controllers for public broker admin and auth route ownership", async () => {
    const controllers = [
      AuthController,
      PublicCountriesController,
      PublicProductsController,
      PublicOffersController,
      PublicQuoteRequestsController,
      BrokerStarterController,
      BrokerCrmController,
      AdminFeatureFlagsController,
      AdminAuditLogsController,
      AdminHealthController,
      PublicWaitlistController,
      PublicContactController,
      PublicPartnersController,
      PublicPartnerDirectoryController,
      PublicInsurersController,
      PublicStatsController,
      AdminPartnerApplicationsController,
      AdminContactMessagesController
    ];

    for (const controller of controllers) {
      expect(Reflect.hasMetadata(PATH_METADATA, controller), controller.name).toBe(true);
    }
  });
});
