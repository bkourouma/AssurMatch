import { afterEach, describe, expect, it } from "vitest";
import { PATH_METADATA } from "@nestjs/common/constants";
import { AppModule } from "../../src/app.module";
import {
  AdminAuditLogsController,
  AdminFeatureFlagsController,
  AdminHealthController,
  AuthController,
  BrokerCrmController,
  BrokerStarterController,
  PublicCountriesController,
  PublicOffersController,
  PublicProductsController,
  PublicQuoteRequestsController,
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

  it("uses the runtime HTTP wiring module instead of registering RuntimeHttpController in AppModule", () => {
    const appImports = Reflect.getMetadata("imports", AppModule) as unknown[];
    const appControllers = (Reflect.getMetadata("controllers", AppModule) as unknown[] | undefined) ?? [];

    expect(appImports).toContain(RuntimeHttpWiringModule);
    expect(appControllers).not.toContain(RuntimeHttpController);
  });

  it("declares decorated P1 domain controllers for public broker admin and auth route ownership", () => {
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
      AdminHealthController
    ];

    for (const controller of controllers) {
      expect(Reflect.hasMetadata(PATH_METADATA, controller), controller.name).toBe(true);
    }
  });
});
