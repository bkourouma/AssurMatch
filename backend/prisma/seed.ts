import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const disabledFlags = [
  "public_comparator_enabled",
  "quote_request_enabled",
  "starter_portal_enabled",
  "broker_crm_enabled",
  "broker_dashboard_enabled",
  "billing_enabled",
  "payments_enabled",
  "e_signature_enabled",
  "policy_issuance_enabled",
  "claims_enabled",
  "insurer_api_enabled",
  "whatsapp_enabled",
  "sponsored_offers_enabled",
  "multi_broker_routing_enabled",
  "ai_lead_scoring_enabled",
  "ai_summary_enabled",
  "ai_duplicate_detection_enabled",
  "ai_recommendation_enabled",
  "ai_broker_assistant_enabled"
];

async function main(): Promise<void> {
  for (const key of disabledFlags) {
    await prisma.featureFlag.upsert({
      where: { key_scopeType_scopeId: { key, scopeType: "global", scopeId: null } },
      create: {
        key,
        scopeType: "global",
        value: false,
        defaultValue: false,
        reason: "Safe disabled default for local development seed"
      },
      update: {
        value: false,
        defaultValue: false,
        reason: "Safe disabled default for local development seed"
      }
    });
  }

  await prisma.country.upsert({
    where: { isoCode: "CI" },
    create: {
      isoCode: "CI",
      name: "Cote d'Ivoire",
      currency: "XOF",
      languages: ["fr"],
      timezone: "Africa/Abidjan",
      regulatoryFamily: "cima",
      status: "internal",
      flags: {
        country_public_enabled: false,
        country_quote_enabled: false,
        country_comparison_enabled: false
      }
    },
    update: {
      status: "internal",
      flags: {
        country_public_enabled: false,
        country_quote_enabled: false,
        country_comparison_enabled: false
      }
    }
  });

  await prisma.product.upsert({
    where: { key: "auto" },
    create: {
      key: "auto",
      name: "Assurance auto",
      description: "Produit indicatif de developpement",
      sensitivity: "standard",
      requiresDocuments: false,
      requiresManualReview: true,
      status: "internal",
      flags: {
        product_public_enabled: false,
        product_quote_enabled: false,
        product_comparison_enabled: false
      }
    },
    update: {
      status: "internal",
      flags: {
        product_public_enabled: false,
        product_quote_enabled: false,
        product_comparison_enabled: false
      }
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
