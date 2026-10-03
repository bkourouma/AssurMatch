import type { OfferGuarantee, OfferPaymentFlexibility } from "../../../../packages/shared/contracts/quote.contracts";
import { AuditLogWriter } from "../audit-logs/audit-log-writer.service";
import { InMemoryRedisClient, type RedisClientPort } from "../common/redis/redis.module";
import { AdminOffersController } from "./admin-offers.controller";
import { BrokerOffersService } from "./broker-offers.service";
import { OfferAdminService } from "./offer-admin.service";
import { OfferLifecycleService, type OfferIntegrations } from "./offer-lifecycle.service";
import { OfferCacheService } from "./offer-cache.service";
import { MemoryOffersRepository, type OffersRepository } from "./offers.repository";
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
  insurerName?: string;
  guaranteeLevel?: number;
  deductibleAmount?: number;
  coverageCeiling?: number;
  processingDelayDays?: number;
  paymentFlexibility?: OfferPaymentFlexibility;
  guarantees?: OfferGuarantee[];
  exclusionsSummary?: string;
  requiredDocuments?: string[];
  sourceOfInformation?: string;
  validatedById?: string;
  validatedAt?: Date;
  /** Spec 052 R1: the content columns hold the published version (or v1 of a never published offer). */
  publishedVersionId?: string;
  pendingVersionId?: string;
  offerType?: "indicative" | "partner";
  withdrawnAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string;
}

/** Partial update where an explicit `undefined` clears the stored value (see `OffersRepository.update`). */
export type OfferPatch<T> = { [K in keyof T]?: T[K] | undefined };

export type OfferVersionStatus = "draft" | "submitted" | "published" | "archived" | "withdrawn";

/** Content of a version (PRD §13); the same keys as the content columns of `OfferRecord`. */
export interface OfferVersionContent {
  name: string;
  shortDescription?: string;
  guaranteeSummary?: string;
  exclusionsSummary?: string;
  insurerName?: string;
  guarantees: OfferGuarantee[];
  guaranteeLevel?: number;
  deductibleAmount?: number;
  coverageCeiling?: number;
  processingDelayDays?: number;
  paymentFlexibility?: OfferPaymentFlexibility;
  requiredDocuments: string[];
  sourceOfInformation?: string;
  indicativePriceMin?: number;
  indicativePriceMax?: number;
  currency: string;
  pricingUnit?: string;
  validFrom: Date;
  validUntil: Date;
  publicDisclaimers: string[];
  isSponsored: boolean;
  sponsorLabel?: string;
  displayPriority: number;
}

/** Spec 052 R1/R2: one version of an offer, immutable once decided. */
export interface OfferVersionRecord extends OfferVersionContent {
  id: string;
  offerId: string;
  versionNumber: number;
  status: OfferVersionStatus;
  completenessScore: number;
  authorId?: string;
  authorRole: "broker" | "admin";
  submittedAt?: Date;
  decidedById?: string;
  decidedAt?: Date;
  lastDecision?: "validated" | "rejected";
  decisionReason?: string;
  createdAt: Date;
  updatedAt: Date;
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
  readonly repository: OffersRepository;
  readonly lifecycle: OfferLifecycleService;
  readonly adminService: OfferAdminService;
  readonly brokerService: BrokerOffersService;
  readonly publicCatalog: PublicOfferCatalogService;
  readonly cache: OfferCacheService;
  readonly publicController: PublicOffersController;
  readonly adminController: AdminOffersController;

  constructor(audit = new AuditLogWriter(), redis: RedisClientPort = new InMemoryRedisClient(), repository: OffersRepository = new MemoryOffersRepository(), integrations: OfferIntegrations = {}) {
    this.repository = repository;
    this.lifecycle = new OfferLifecycleService(this.repository, audit);
    this.lifecycle.integrations = integrations;
    this.adminService = new OfferAdminService(this.repository, audit, this.lifecycle);
    this.brokerService = new BrokerOffersService(this.repository, this.lifecycle, audit);
    this.publicCatalog = new PublicOfferCatalogService(this.repository, audit);
    this.cache = new OfferCacheService(redis);
    this.publicController = new PublicOffersController(this.publicCatalog);
    this.adminController = new AdminOffersController(this.adminService);
  }
}

export { OFFERS_REPOSITORY, MemoryOffersRepository, type OffersRepository } from "./offers.repository";
