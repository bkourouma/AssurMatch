import type { AdminProductCategoryView } from "../../../../packages/shared/contracts/catalog.contracts";
import { CatalogAccess } from "../catalog/catalog-access";
import type { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import type { ActorContext } from "../common/types";
import { ProductCategoriesService, ProductCategoryAuditActions } from "./product-categories.service";

/**
 * Spec 070 PROD-001: admin product categories. Categories are global (they span every country),
 * so reads follow `products:read` (compliance included) and writes need `products:create|update`
 * on an unscoped admin. A refused access is audited and answered 403.
 */
export class AdminProductCategoriesController {
  private readonly access: CatalogAccess;

  constructor(private readonly categories: ProductCategoriesService, audit: AuditLogWriter) {
    this.access = new CatalogAccess(audit);
  }

  list(actor: ActorContext): Promise<AdminProductCategoryView[]> {
    this.requireRead(actor, "list");
    return this.categories.list();
  }

  get(actor: ActorContext, id: string): Promise<AdminProductCategoryView> {
    this.requireRead(actor, id);
    return this.categories.get(id);
  }

  create(actor: ActorContext, input: unknown): Promise<AdminProductCategoryView> {
    this.access.require(actor, this.access.can(actor, "products:create") && this.access.isUnscoped(actor), {
      action: ProductCategoryAuditActions.createRefused, targetType: "ProductCategory", targetId: "new", refusal: "rbac_denied"
    });
    return this.categories.create(input, actor);
  }

  update(actor: ActorContext, id: string, input: unknown): Promise<AdminProductCategoryView> {
    this.access.require(actor, this.access.can(actor, "products:update") && this.access.isUnscoped(actor), {
      action: ProductCategoryAuditActions.updateRefused, targetType: "ProductCategory", targetId: id, refusal: "rbac_denied"
    });
    return this.categories.update(id, input, actor);
  }

  private requireRead(actor: ActorContext, targetId: string): void {
    this.access.require(actor, this.access.canRead(actor, "products:read"), {
      action: ProductCategoryAuditActions.readRefused, targetType: "ProductCategory", targetId, refusal: "rbac_denied"
    });
  }
}
