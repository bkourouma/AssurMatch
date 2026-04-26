import { AuditLogWriter } from "../../../src/modules/audit-logs/audit-log-writer.service";
import { CountriesService } from "../../../src/modules/countries/countries.module";
import { ProductsService } from "../../../src/modules/products/products.module";
import { PartnersService } from "../../../src/modules/partners/partners.module";
import { UsersService } from "../../../src/modules/users/users.module";
import type { ActorContext } from "../../../src/modules/common/types";

export const superAdminActor: ActorContext = {
  actorId: "00000000-0000-4000-8000-000000000001",
  roles: ["super_admin"],
  mfaVerified: true,
  correlationId: "test-correlation"
};

export function createFoundationServices() {
  const audit = new AuditLogWriter();
  return {
    audit,
    countries: new CountriesService(audit),
    products: new ProductsService(audit),
    partners: new PartnersService(audit),
    users: new UsersService(audit)
  };
}

export async function seedMiniCatalog() {
  const services = createFoundationServices();
  const country = await services.countries.create(
    {
      isoCode: "CI",
      name: "Cote d'Ivoire",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Abidjan",
      regulatoryFamily: "cima",
      regulatoryRegimeId: "00000000-0000-4000-8000-000000000010"
    },
    superAdminActor
  );
  const product = await services.products.create(
    {
      key: "auto",
      name: "Assurance auto",
      sensitivity: "standard"
    },
    superAdminActor
  );
  await services.products.associateCountry(product.id, country.id, superAdminActor);
  return { ...services, country, product };
}
