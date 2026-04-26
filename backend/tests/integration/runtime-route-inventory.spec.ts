import { afterEach, describe, expect, it } from "vitest";
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
});
