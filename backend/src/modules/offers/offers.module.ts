import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { InMemoryRedisClient } from "../common/redis/redis.module";
import { AdminOffersController } from "./admin-offers.controller";
import { OfferAdminService } from "./offer-admin.service";
import { OfferCacheService } from "./offer-cache.service";
import { PublicOfferCatalogService } from "./public-offer-catalog.service";
import { PublicOffersController } from "./public-offers.controller";

export type OfferStatus = "draft" | "review" | "validated" | "active" | "suspended" | "expired" | "retired";
export type OfferValidationStatus = "pending" | "validated" | "rejected";

export interface OfferRecord {
  id: string;
  countryId: string;
  productId: string;
  partnerTenantId?: string;
  publicKey: string;
  name: string;
  shortDescription?: string;
  guaranteeSummary?: string;
  indicativePriceMin?: number;
  indicativePriceMax?: number;
  currency: string;
  pricingUnit?: string;
  status: OfferStatus;
  validationStatus: OfferValidationStatus;
  validFrom: Date;
  validUntil: Date;
  isSponsored: boolean;
  sponsorLabel?: string;
  displayPriority: number;
  publicDisclaimers: string[];
  validatedById?: string;
  validatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string;
}

export interface OfferHistoryRecord {
  id: string;
  offerId: string;
  changedById?: string;
  changeType: string;
  previousValue?: unknown;
  nextValue?: unknown;
  reason: string;
  changedAt: Date;
}

export class OffersModule {
  readonly offers: OfferRecord[] = [];
  readonly history: OfferHistoryRecord[] = [];
  readonly adminService: OfferAdminService;
  readonly publicCatalog: PublicOfferCatalogService;
  readonly cache: OfferCacheService;
  readonly publicController: PublicOffersController;
  readonly adminController: AdminOffersController;

  constructor(audit = new AuditLogWriter(), redis = new InMemoryRedisClient()) {
    this.adminService = new OfferAdminService(this.offers, this.history, audit);
    this.publicCatalog = new PublicOfferCatalogService(this.offers, audit);
    this.cache = new OfferCacheService(redis);
    this.publicController = new PublicOffersController(this.publicCatalog);
    this.adminController = new AdminOffersController(this.adminService);
  }
}
