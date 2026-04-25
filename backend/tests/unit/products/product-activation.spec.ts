import { describe, expect, it } from "vitest";
import { ProductsService } from "../../../src/modules/products/products.module";
import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { superAdminActor } from "../../integration/helpers/enterprise-seed";

describe("product activation rules", () => {
  it("defaults products to public disabled and manual review for sensitive data", () => {
    const service = new ProductsService(new AuditLogWriter());
    const product = service.create({ key: "health", name: "Sante", sensitivity: "sensitive" }, superAdminActor);

    expect(product.flags.product_public_enabled).toBe(false);
    expect(product.requiresManualReview).toBe(true);
  });

  it("blocks public activation without country association and flag", () => {
    const service = new ProductsService(new AuditLogWriter());
    const product = service.create({ key: "auto", name: "Auto" }, superAdminActor);

    expect(() => service.update(product.id, { status: "public", reason: "activation test" }, superAdminActor)).toThrow();
  });
});
