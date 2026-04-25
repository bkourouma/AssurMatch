import { Module } from "@nestjs/common";
import { AuditLogsModule } from "./modules/audit-logs/audit-logs.module";
import { ConfigModule } from "./config/config.module";
import { PrismaService } from "./modules/common/prisma/prisma.service";
import { RedisModule } from "./modules/common/redis/redis.module";
import { QueuesModule } from "./modules/common/queues/queues.module";
import { CountriesModule } from "./modules/countries/countries.module";
import { ProductsModule } from "./modules/products/products.module";
import { RegulatoryRegimesModule } from "./modules/regulatory-regimes/regulatory-regimes.module";
import { PartnersModule } from "./modules/partners/partners.module";
import { PartnerLicensesModule } from "./modules/partner-licenses/partner-licenses.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { UsersModule } from "./modules/users/users.module";
import { AuthModule } from "./modules/auth/auth.module";
import { FeatureFlagsModule } from "./modules/feature-flags/feature-flags.module";
import { ConsentModule } from "./modules/consent/consent.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { AIModule } from "./modules/ai/ai.module";

@Module({})
export class AppModule {
  readonly config = new ConfigModule();
  readonly prisma = new PrismaService();
  readonly redis = new RedisModule();
  readonly queues = new QueuesModule();
  readonly audit = new AuditLogsModule();
  readonly regulatoryRegimes = new RegulatoryRegimesModule(this.audit.writer);
  readonly countries = new CountriesModule(this.audit.writer);
  readonly products = new ProductsModule(this.audit.writer);
  readonly partners = new PartnersModule(this.audit.writer);
  readonly partnerLicenses = new PartnerLicensesModule(this.audit.writer);
  readonly documents = new DocumentsModule(this.audit.writer);
  readonly users = new UsersModule(this.audit.writer);
  readonly auth = new AuthModule(this.users.service);
  readonly featureFlags = new FeatureFlagsModule(this.audit.writer);
  readonly consent = new ConsentModule(this.audit.writer);
  readonly notifications = new NotificationsModule(this.audit.writer);
  readonly ai = new AIModule(this.audit.writer);
}
