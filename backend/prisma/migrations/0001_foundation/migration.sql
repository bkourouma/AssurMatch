-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('invited', 'active', 'suspended', 'locked', 'deleted');

-- CreateEnum
CREATE TYPE "MfaStatus" AS ENUM ('not_enrolled', 'enrolled', 'required', 'verified');

-- CreateEnum
CREATE TYPE "PartnerPlan" AS ENUM ('starter', 'pro', 'enterprise');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('draft', 'pending_compliance', 'active', 'suspended', 'retired');

-- CreateEnum
CREATE TYPE "CapacityStatus" AS ENUM ('available', 'limited', 'full', 'blocked');

-- CreateEnum
CREATE TYPE "CountryStatus" AS ENUM ('draft', 'internal', 'partner_test', 'pilot', 'public', 'suspended', 'retired');

-- CreateEnum
CREATE TYPE "RegulatoryFamily" AS ENUM ('cima', 'fanaf', 'outside_cima', 'future');

-- CreateEnum
CREATE TYPE "RegimeStatus" AS ENUM ('draft', 'active', 'suspended', 'retired');

-- CreateEnum
CREATE TYPE "ProductCategoryStatus" AS ENUM ('draft', 'active', 'retired');

-- CreateEnum
CREATE TYPE "ProductSensitivity" AS ENUM ('standard', 'sensitive', 'highly_sensitive');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('draft', 'internal', 'pilot', 'public', 'suspended', 'retired');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('draft', 'pending_review', 'valid', 'expired', 'suspended', 'invalid', 'revoked');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('uploaded', 'pending_review', 'accepted', 'rejected', 'expired', 'superseded');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('license', 'registration', 'identity', 'mandate', 'compliance_certificate', 'other');

-- CreateEnum
CREATE TYPE "FeatureFlagScopeType" AS ENUM ('global', 'country', 'product', 'partner', 'plan', 'module', 'ai');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('lead_transmission', 'document_upload', 'technical_notification', 'ai_processing', 'marketing_optional');

-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('public_web', 'admin', 'broker', 'api');

-- CreateEnum
CREATE TYPE "ConsentTextStatus" AS ENUM ('draft', 'review', 'published', 'retired');

-- CreateEnum
CREATE TYPE "ConsentRecordStatus" AS ENUM ('granted', 'withdrawn', 'expired', 'anonymized');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('success', 'refused', 'failed');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('license_expiration_warning', 'license_blocked', 'partner_suspended', 'feature_flag_changed', 'critical_job_failed', 'consent_text_changed', 'security_admin_change', 'visitor_quote_confirmation', 'visitor_quote_non_routable', 'broker_lead_assigned', 'quote_notification_failed');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'queued', 'sent', 'delivered', 'failed', 'retryable');

-- CreateEnum
CREATE TYPE "QueueJobStatus" AS ENUM ('queued', 'active', 'completed', 'failed', 'retryable', 'discarded');

-- CreateEnum
CREATE TYPE "QueueJobType" AS ENUM ('notification', 'document_hook', 'future_ia', 'future_routing', 'maintenance', 'visitor_quote_notification', 'broker_lead_notification', 'ai_quote_summary', 'quote_manual_review');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('draft', 'review', 'validated', 'active', 'suspended', 'expired', 'retired');

-- CreateEnum
CREATE TYPE "OfferValidationStatus" AS ENUM ('pending', 'validated', 'rejected');

-- CreateEnum
CREATE TYPE "QuoteFormStatus" AS ENUM ('draft', 'published', 'suspended', 'retired');

-- CreateEnum
CREATE TYPE "QuoteRequestStatus" AS ENUM ('draft_refused', 'created', 'manual_review', 'routed', 'non_routable', 'duplicate', 'spam_blocked', 'cancelled');

-- CreateEnum
CREATE TYPE "RoutingStatus" AS ENUM ('not_started', 'eligible', 'assigned', 'blocked', 'no_broker_available', 'manual_review_required');

-- CreateEnum
CREATE TYPE "DuplicateStatus" AS ENUM ('not_checked', 'unique', 'possible_duplicate', 'blocked_duplicate');

-- CreateEnum
CREATE TYPE "LeadAssignmentStatus" AS ENUM ('assigned', 'broker_notified', 'seen', 'accepted', 'received', 'contacted', 'rejected', 'closed', 'disputed');

-- CreateEnum
CREATE TYPE "BrokerCrmPipelineStatus" AS ENUM ('nouveau', 'accepte', 'contact_tente', 'contacte', 'qualifie', 'documents_demandes', 'devis_en_preparation', 'devis_envoye', 'negociation', 'gagne', 'perdu', 'doublon', 'injoignable', 'hors_cible', 'rejete_conteste');

-- CreateEnum
CREATE TYPE "BrokerCrmUrgency" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "AIStatus" AS ENUM ('disabled', 'internal_test', 'enabled');

-- CreateEnum
CREATE TYPE "GuardrailStatus" AS ENUM ('not_configured', 'configured', 'failed_review', 'approved');

-- CreateEnum
CREATE TYPE "AuditPolicy" AS ENUM ('metadata_only', 'full_prompt_metadata', 'sensitive_human_validation');

-- CreateEnum
CREATE TYPE "HumanValidationStatus" AS ENUM ('not_required', 'pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "displayName" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'invited',
    "mfaStatus" "MfaStatus" NOT NULL DEFAULT 'required',
    "lastLoginAt" TIMESTAMP(3),
    "partnerTenantId" TEXT,
    "countryScopes" TEXT[],
    "productScopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isSystemRole" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "scopeType" "FeatureFlagScopeType" NOT NULL,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerTenant" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "registrationNumber" TEXT,
    "plan" "PartnerPlan" NOT NULL DEFAULT 'starter',
    "status" "PartnerStatus" NOT NULL DEFAULT 'draft',
    "suspensionReason" TEXT,
    "primaryEmail" TEXT NOT NULL,
    "primaryWhatsApp" TEXT NOT NULL,
    "quotaMonthlyLeads" INTEGER NOT NULL DEFAULT 0,
    "capacityStatus" "CapacityStatus" NOT NULL DEFAULT 'available',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "PartnerTenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerCountryAuthorization" (
    "id" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "PartnerCountryAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerProductAuthorization" (
    "id" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "PartnerProductAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryRegime" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "retentionOverrideYears" INTEGER,
    "requiresManualActivationReview" BOOLEAN NOT NULL DEFAULT false,
    "status" "RegimeStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "RegulatoryRegime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "isoCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "languages" TEXT[],
    "timezone" TEXT NOT NULL,
    "regulatoryFamily" "RegulatoryFamily" NOT NULL,
    "regulatoryRegimeId" TEXT,
    "status" "CountryStatus" NOT NULL DEFAULT 'draft',
    "flags" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ProductCategoryStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sensitivity" "ProductSensitivity" NOT NULL DEFAULT 'standard',
    "requiresDocuments" BOOLEAN NOT NULL DEFAULT false,
    "requiresManualReview" BOOLEAN NOT NULL DEFAULT true,
    "status" "ProductStatus" NOT NULL DEFAULT 'draft',
    "flags" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryProduct" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'internal',
    "flags" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "CountryProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerLicense" (
    "id" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "issuingAuthority" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "productIds" TEXT[],
    "status" "LicenseStatus" NOT NULL DEFAULT 'draft',
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "PartnerLicense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccreditationDocument" (
    "id" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "licenseId" TEXT,
    "documentType" "DocumentType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'uploaded',
    "expirationDate" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "AccreditationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scopeType" "FeatureFlagScopeType" NOT NULL,
    "scopeId" TEXT,
    "value" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cacheVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlagHistory" (
    "id" TEXT NOT NULL,
    "featureFlagId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scopeType" "FeatureFlagScopeType" NOT NULL,
    "scopeId" TEXT,
    "previousValue" BOOLEAN NOT NULL,
    "nextValue" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureFlagHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentText" (
    "id" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "countryId" TEXT NOT NULL,
    "productId" TEXT,
    "channel" "ConsentChannel" NOT NULL,
    "recipientCategory" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "ConsentTextStatus" NOT NULL DEFAULT 'draft',
    "contentHash" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "ConsentText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "consentTextId" TEXT NOT NULL,
    "subjectReference" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "countryId" TEXT NOT NULL,
    "productId" TEXT,
    "channel" "ConsentChannel" NOT NULL,
    "intendedRecipient" TEXT NOT NULL,
    "status" "ConsentRecordStatus" NOT NULL DEFAULT 'granted',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "result" "AuditResult" NOT NULL,
    "reason" TEXT,
    "context" JSONB NOT NULL,
    "correlationId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "recipientScope" TEXT NOT NULL,
    "whatsAppStatus" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "emailStatus" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "payloadReference" TEXT NOT NULL,
    "relatedAuditLogId" TEXT,
    "queueJobRecordId" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueJobRecord" (
    "id" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "jobType" "QueueJobType" NOT NULL,
    "status" "QueueJobStatus" NOT NULL DEFAULT 'queued',
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "correlationId" TEXT,
    "visibleToRoles" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "QueueJobRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIModuleConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" "AIStatus" NOT NULL DEFAULT 'disabled',
    "allowedScopes" JSONB NOT NULL,
    "promptTemplateReference" TEXT,
    "guardrailStatus" "GuardrailStatus" NOT NULL DEFAULT 'not_configured',
    "auditPolicy" "AuditPolicy" NOT NULL DEFAULT 'metadata_only',
    "quotaPolicyReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "AIModuleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIInteraction" (
    "id" TEXT NOT NULL,
    "moduleConfigId" TEXT NOT NULL,
    "actorId" TEXT,
    "scope" JSONB NOT NULL,
    "minimizedInputReference" TEXT NOT NULL,
    "outputReference" TEXT NOT NULL,
    "guardrailResult" TEXT NOT NULL,
    "humanValidationStatus" "HumanValidationStatus" NOT NULL DEFAULT 'not_required',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingPrecheck" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "consentStatus" TEXT NOT NULL,
    "countryStatus" TEXT NOT NULL,
    "productStatus" TEXT NOT NULL,
    "partnerStatus" TEXT NOT NULL,
    "licenseStatus" TEXT NOT NULL,
    "quotaStatus" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "reasons" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "RoutingPrecheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "partnerTenantId" TEXT,
    "publicKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortDescription" TEXT,
    "guaranteeSummary" TEXT,
    "indicativePriceMin" DECIMAL(65,30),
    "indicativePriceMax" DECIMAL(65,30),
    "currency" TEXT NOT NULL,
    "pricingUnit" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'draft',
    "validationStatus" "OfferValidationStatus" NOT NULL DEFAULT 'pending',
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "isSponsored" BOOLEAN NOT NULL DEFAULT false,
    "sponsorLabel" TEXT,
    "displayPriority" INTEGER NOT NULL DEFAULT 0,
    "publicDisclaimers" TEXT[],
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferHistory" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "changedById" TEXT,
    "changeType" TEXT NOT NULL,
    "previousValue" JSONB,
    "nextValue" JSONB,
    "reason" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteFormDefinition" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "QuoteFormStatus" NOT NULL DEFAULT 'draft',
    "fields" JSONB NOT NULL,
    "validationSchema" JSONB,
    "consentTextId" TEXT NOT NULL,
    "dataMinimizationNotes" TEXT,
    "publishedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "QuoteFormDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "emailNormalized" TEXT,
    "phoneNormalized" TEXT,
    "emailFingerprint" TEXT,
    "phoneFingerprint" TEXT,
    "displayName" TEXT,
    "preferredContactChannel" TEXT,
    "consentRecordIds" TEXT[],
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRequest" (
    "id" TEXT NOT NULL,
    "publicReference" TEXT NOT NULL,
    "verificationTokenHash" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "selectedOfferId" TEXT,
    "quoteFormDefinitionId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "consentRecordId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "QuoteRequestStatus" NOT NULL DEFAULT 'created',
    "duplicateStatus" "DuplicateStatus" NOT NULL DEFAULT 'not_checked',
    "routingStatus" "RoutingStatus" NOT NULL DEFAULT 'not_started',
    "refusalReason" TEXT,
    "manualReviewReason" TEXT,
    "correlationId" TEXT,
    "retentionUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadAssignment" (
    "id" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "status" "LeadAssignmentStatus" NOT NULL DEFAULT 'assigned',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignmentReason" TEXT NOT NULL,
    "routingDecisionId" TEXT,
    "brokerNotificationId" TEXT,
    "seenAt" TIMESTAMP(3),
    "seenById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "disputedAt" TIMESTAMP(3),
    "actionReason" TEXT,
    "actionComment" TEXT,
    "lastBrokerActionById" TEXT,
    "lastBrokerActionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActionHistory" (
    "id" TEXT NOT NULL,
    "leadAssignmentId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" TEXT NOT NULL,
    "previousStatus" TEXT,
    "nextStatus" TEXT,
    "reason" TEXT,
    "comment" TEXT,
    "context" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerCrmLeadState" (
    "id" TEXT NOT NULL,
    "leadAssignmentId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "status" "BrokerCrmPipelineStatus" NOT NULL DEFAULT 'nouveau',
    "urgency" "BrokerCrmUrgency" NOT NULL DEFAULT 'normal',
    "source" TEXT NOT NULL DEFAULT 'quote_request',
    "assignedAdvisorId" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "BrokerCrmLeadState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerCrmPipelineHistory" (
    "id" TEXT NOT NULL,
    "leadAssignmentId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "previousStatus" "BrokerCrmPipelineStatus",
    "nextStatus" "BrokerCrmPipelineStatus" NOT NULL,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerCrmPipelineHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerCrmNote" (
    "id" TEXT NOT NULL,
    "leadAssignmentId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerCrmNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerCrmTask" (
    "id" TEXT NOT NULL,
    "leadAssignmentId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerCrmTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerCrmReminder" (
    "id" TEXT NOT NULL,
    "leadAssignmentId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "message" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerCrmReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerCrmDocument" (
    "id" TEXT NOT NULL,
    "leadAssignmentId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'internal',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerCrmDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerCrmProposal" (
    "id" TEXT NOT NULL,
    "leadAssignmentId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amountIndicative" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "notes" TEXT,
    "nonContractual" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerCrmProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerCrmDispute" (
    "id" TEXT NOT NULL,
    "leadAssignmentId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'opened',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerCrmDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerCrmAiAssistRequest" (
    "id" TEXT NOT NULL,
    "leadAssignmentId" TEXT NOT NULL,
    "partnerTenantId" TEXT NOT NULL,
    "assistType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disabled',
    "auditLogId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrokerCrmAiAssistRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingDecision" (
    "id" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "selectedPartnerTenantId" TEXT,
    "candidateCount" INTEGER NOT NULL,
    "excludedCandidates" JSONB NOT NULL,
    "reasons" TEXT[],
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutingDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteAISummary" (
    "id" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "aiInteractionId" TEXT,
    "summaryReference" TEXT,
    "guardrailResult" TEXT NOT NULL,
    "humanValidationStatus" "HumanValidationStatus" NOT NULL DEFAULT 'not_required',
    "visibleToBroker" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteAISummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvironmentSetting" (
    "id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "safeDefault" TEXT NOT NULL,
    "requiresSecret" BOOLEAN NOT NULL DEFAULT false,
    "ownerModule" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnvironmentSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_resource_action_scopeType_key" ON "Permission"("resource", "action", "scopeType");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCountryAuthorization_partnerTenantId_countryId_key" ON "PartnerCountryAuthorization"("partnerTenantId", "countryId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProductAuthorization_partnerTenantId_productId_key" ON "PartnerProductAuthorization"("partnerTenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryRegime_key_key" ON "RegulatoryRegime"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Country_isoCode_key" ON "Country"("isoCode");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_key_key" ON "ProductCategory"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Product_key_key" ON "Product"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CountryProduct_countryId_productId_key" ON "CountryProduct"("countryId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_scopeType_scopeId_key" ON "FeatureFlag"("key", "scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentText_purpose_countryId_productId_channel_language_ve_key" ON "ConsentText"("purpose", "countryId", "productId", "channel", "language", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AIModuleConfig_key_key" ON "AIModuleConfig"("key");

-- CreateIndex
CREATE INDEX "Offer_countryId_productId_status_validationStatus_validFrom_idx" ON "Offer"("countryId", "productId", "status", "validationStatus", "validFrom", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_countryId_productId_publicKey_key" ON "Offer"("countryId", "productId", "publicKey");

-- CreateIndex
CREATE INDEX "OfferHistory_offerId_changedAt_idx" ON "OfferHistory"("offerId", "changedAt");

-- CreateIndex
CREATE INDEX "QuoteFormDefinition_countryId_productId_language_status_ver_idx" ON "QuoteFormDefinition"("countryId", "productId", "language", "status", "version");

-- CreateIndex
CREATE INDEX "Prospect_countryId_productId_emailFingerprint_phoneFingerpr_idx" ON "Prospect"("countryId", "productId", "emailFingerprint", "phoneFingerprint", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequest_publicReference_key" ON "QuoteRequest"("publicReference");

-- CreateIndex
CREATE INDEX "QuoteRequest_countryId_productId_status_routingStatus_creat_idx" ON "QuoteRequest"("countryId", "productId", "status", "routingStatus", "createdAt");

-- CreateIndex
CREATE INDEX "LeadAssignment_partnerTenantId_status_assignedAt_idx" ON "LeadAssignment"("partnerTenantId", "status", "assignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadAssignment_quoteRequestId_key" ON "LeadAssignment"("quoteRequestId");

-- CreateIndex
CREATE INDEX "LeadActionHistory_leadAssignmentId_occurredAt_idx" ON "LeadActionHistory"("leadAssignmentId", "occurredAt");

-- CreateIndex
CREATE INDEX "LeadActionHistory_partnerTenantId_occurredAt_idx" ON "LeadActionHistory"("partnerTenantId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerCrmLeadState_leadAssignmentId_key" ON "BrokerCrmLeadState"("leadAssignmentId");

-- CreateIndex
CREATE INDEX "BrokerCrmLeadState_partnerTenantId_status_updatedAt_idx" ON "BrokerCrmLeadState"("partnerTenantId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "BrokerCrmLeadState_partnerTenantId_assignedAdvisorId_idx" ON "BrokerCrmLeadState"("partnerTenantId", "assignedAdvisorId");

-- CreateIndex
CREATE INDEX "BrokerCrmPipelineHistory_leadAssignmentId_occurredAt_idx" ON "BrokerCrmPipelineHistory"("leadAssignmentId", "occurredAt");

-- CreateIndex
CREATE INDEX "BrokerCrmPipelineHistory_partnerTenantId_occurredAt_idx" ON "BrokerCrmPipelineHistory"("partnerTenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "BrokerCrmNote_leadAssignmentId_createdAt_idx" ON "BrokerCrmNote"("leadAssignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "BrokerCrmNote_partnerTenantId_createdAt_idx" ON "BrokerCrmNote"("partnerTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "BrokerCrmTask_partnerTenantId_assigneeId_dueAt_idx" ON "BrokerCrmTask"("partnerTenantId", "assigneeId", "dueAt");

-- CreateIndex
CREATE INDEX "BrokerCrmTask_leadAssignmentId_createdAt_idx" ON "BrokerCrmTask"("leadAssignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "BrokerCrmReminder_partnerTenantId_assigneeId_remindAt_idx" ON "BrokerCrmReminder"("partnerTenantId", "assigneeId", "remindAt");

-- CreateIndex
CREATE INDEX "BrokerCrmDocument_leadAssignmentId_createdAt_idx" ON "BrokerCrmDocument"("leadAssignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "BrokerCrmDocument_partnerTenantId_visibility_idx" ON "BrokerCrmDocument"("partnerTenantId", "visibility");

-- CreateIndex
CREATE INDEX "BrokerCrmProposal_leadAssignmentId_createdAt_idx" ON "BrokerCrmProposal"("leadAssignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "BrokerCrmProposal_partnerTenantId_createdAt_idx" ON "BrokerCrmProposal"("partnerTenantId", "createdAt");

-- CreateIndex
CREATE INDEX "BrokerCrmDispute_leadAssignmentId_createdAt_idx" ON "BrokerCrmDispute"("leadAssignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "BrokerCrmDispute_partnerTenantId_status_idx" ON "BrokerCrmDispute"("partnerTenantId", "status");

-- CreateIndex
CREATE INDEX "BrokerCrmAiAssistRequest_partnerTenantId_assistType_created_idx" ON "BrokerCrmAiAssistRequest"("partnerTenantId", "assistType", "createdAt");

-- CreateIndex
CREATE INDEX "RoutingDecision_quoteRequestId_createdAt_idx" ON "RoutingDecision"("quoteRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteAISummary_quoteRequestId_idx" ON "QuoteAISummary"("quoteRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "EnvironmentSetting_environment_key_key" ON "EnvironmentSetting"("environment", "key");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
