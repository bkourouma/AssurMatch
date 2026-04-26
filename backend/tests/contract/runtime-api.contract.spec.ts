import { afterEach, describe, expect, it } from "vitest";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { createRuntimeHttpHarness, type RuntimeHttpHarness } from "../integration/runtime-http-test-utils";
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
  PublicQuoteRequestsController
} from "../../src/modules/http-wiring/runtime-http-wiring.module";

describe("runtime API contract smoke", () => {
  let harness: RuntimeHttpHarness | undefined;

  afterEach(async () => {
    await harness?.close();
    harness = undefined;
  });

  it("keeps documented public routes callable through HTTP", async () => {
    harness = await createRuntimeHttpHarness();

    const countries = await harness.request("/countries");
    expect(countries.status).toBe(200);

    const quoteRequest = await harness.request("/quote-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    expect([400, 422]).toContain(quoteRequest.status);
  });

  it("documents controller ownership for the P1 HTTP wiring routes", async () => {
    const ownership: Array<{ controller: { name: string; prototype: object }; path: string }> = [
      { controller: AuthController, path: "auth" },
      { controller: PublicCountriesController, path: "countries" },
      { controller: PublicProductsController, path: "countries/:countryCode/products" },
      { controller: PublicOffersController, path: "/" },
      { controller: PublicQuoteRequestsController, path: "/" },
      { controller: BrokerStarterController, path: "broker/starter" },
      { controller: BrokerCrmController, path: "broker/crm" },
      { controller: AdminFeatureFlagsController, path: "admin" },
      { controller: AdminAuditLogsController, path: "admin" },
      { controller: AdminHealthController, path: "admin" }
    ];

    for (const { controller, path } of ownership) {
      expect(Reflect.getMetadata(PATH_METADATA, controller), controller.name).toBe(path);
      const routeCount = Object.getOwnPropertyNames(controller.prototype)
        .filter((name) => name !== "constructor")
        .filter((name) => {
          const method = (controller.prototype as Record<string, object | undefined>)[name];
          return method ? Reflect.hasMetadata(METHOD_METADATA, method) : false;
        });
      expect(routeCount.length, controller.name).toBeGreaterThan(0);
    }
  });

  it("does not expose forbidden regulated route groups as active runtime paths", async () => {
    harness = await createRuntimeHttpHarness();

    for (const path of ["/payments", "/policies", "/attestations", "/claims", "/e-signature"]) {
      const response = await harness.request(path);
      expect(response.status, path).toBe(404);
    }
  });
});
