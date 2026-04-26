import type { ProductDto } from "../../../../packages/shared/contracts/catalog.contracts";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { ProductsService, type Product } from "./products.module";

export class AdminProductsController {
  private readonly rbac = new RbacGuard();

  constructor(private readonly products: ProductsService) {}

  list(actor: ActorContext, countryId?: string): Promise<Product[]> {
    this.rbac.assert(actor, "products:read", countryId ? { countryId } : {});
    return this.products.listAdmin(countryId);
  }

  create(actor: ActorContext, input: ProductDto): Promise<Product> {
    this.rbac.assert(actor, "products:create");
    return this.products.create(input, actor);
  }

  associateCountry(actor: ActorContext, productId: string, countryId: string): Promise<Product> {
    this.rbac.assert(actor, "products:update", { countryId, productId });
    return this.products.associateCountry(productId, countryId, actor);
  }

  update(actor: ActorContext, id: string, input: Partial<ProductDto> & { reason: string }): Promise<Product> {
    this.rbac.assert(actor, "products:update", { productId: id });
    return this.products.update(id, input, actor);
  }
}
