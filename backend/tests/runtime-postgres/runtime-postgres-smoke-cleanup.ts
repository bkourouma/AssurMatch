import type { RuntimeSmokeRun } from "./runtime-postgres-smoke-data";
import type { RuntimeSmokePrismaClient } from "./runtime-postgres-smoke-prisma";

export async function cleanupRuntimeSmokeData(prisma: RuntimeSmokePrismaClient, run: RuntimeSmokeRun, options: { keepData: boolean }): Promise<void> {
  if (options.keepData) return;

  const partners = await prisma.partnerTenant.findMany({
    where: { legalName: { contains: run.prefix } },
    select: { id: true }
  });
  const partnerIds = partners.map((partner) => partner.id);
  const countries = await prisma.country.findMany({
    where: { name: { contains: run.prefix } },
    select: { id: true }
  });
  const countryIds = countries.map((country) => country.id);
  const products = await prisma.product.findMany({
    where: { key: run.productKey },
    select: { id: true }
  });
  const productIds = products.map((product) => product.id);
  const quotes = await prisma.quoteRequest.findMany({
    where: { OR: [{ correlationId: run.correlationId }, { publicReference: { contains: run.id } }] },
    select: { id: true, prospectId: true, consentRecordId: true }
  });
  const quoteIds = quotes.map((quote) => quote.id);
  const prospectIds = quotes.map((quote) => quote.prospectId);
  const consentRecordIds = quotes.map((quote) => quote.consentRecordId);
  const leadAssignments = await prisma.leadAssignment.findMany({
    where: {
      OR: [
        { quoteRequestId: { in: quoteIds } },
        { partnerTenantId: { in: partnerIds } }
      ]
    },
    select: { id: true, brokerNotificationId: true }
  });
  const leadIds = leadAssignments.map((lead) => lead.id);
  const notificationIds = leadAssignments.map((lead) => lead.brokerNotificationId).filter((id): id is string => Boolean(id));

  await prisma.brokerCrmAiAssistRequest.deleteMany({ where: { leadAssignmentId: { in: leadIds } } });
  await prisma.brokerCrmDispute.deleteMany({ where: { leadAssignmentId: { in: leadIds } } });
  await prisma.brokerCrmProposal.deleteMany({ where: { leadAssignmentId: { in: leadIds } } });
  await prisma.brokerCrmDocument.deleteMany({ where: { leadAssignmentId: { in: leadIds } } });
  await prisma.brokerCrmReminder.deleteMany({ where: { leadAssignmentId: { in: leadIds } } });
  await prisma.brokerCrmTask.deleteMany({ where: { leadAssignmentId: { in: leadIds } } });
  await prisma.brokerCrmNote.deleteMany({ where: { leadAssignmentId: { in: leadIds } } });
  await prisma.brokerCrmPipelineHistory.deleteMany({ where: { leadAssignmentId: { in: leadIds } } });
  await prisma.brokerCrmLeadState.deleteMany({ where: { leadAssignmentId: { in: leadIds } } });
  await prisma.leadActionHistory.deleteMany({ where: { leadAssignmentId: { in: leadIds } } });
  await prisma.notification.deleteMany({ where: { OR: [{ id: { in: notificationIds } }, { payloadReference: { contains: run.id } }] } });
  await prisma.queueJobRecord.deleteMany({ where: { correlationId: run.correlationId } });
  await prisma.leadAssignment.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.routingDecision.deleteMany({ where: { OR: [{ quoteRequestId: { in: quoteIds } }, { correlationId: run.correlationId }] } });
  await prisma.quoteRequest.deleteMany({ where: { id: { in: quoteIds } } });
  await prisma.consentRecord.deleteMany({ where: { OR: [{ id: { in: consentRecordIds } }, { subjectReference: { contains: run.id } }] } });
  await prisma.prospect.deleteMany({ where: { OR: [{ id: { in: prospectIds } }, { emailNormalized: run.email }] } });
  await prisma.offerHistory.deleteMany({ where: { reason: { contains: "runtime smoke" } } });
  await prisma.offer.deleteMany({ where: { OR: [{ publicKey: { contains: run.id } }, { name: { contains: run.prefix } }] } });
  await prisma.partnerLicense.deleteMany({ where: { partnerTenantId: { in: partnerIds } } });
  await prisma.partnerCountryAuthorization.deleteMany({ where: { partnerTenantId: { in: partnerIds } } });
  await prisma.partnerProductAuthorization.deleteMany({ where: { partnerTenantId: { in: partnerIds } } });
  await prisma.partnerTenant.deleteMany({ where: { id: { in: partnerIds } } });
  await prisma.quoteFormDefinition.deleteMany({ where: { OR: [{ countryId: { in: countryIds } }, { productId: { in: productIds } }] } });
  await prisma.consentText.deleteMany({ where: { OR: [{ countryId: { in: countryIds } }, { productId: { in: productIds } }, { contentHash: { contains: run.id } }] } });
  await prisma.countryProduct.deleteMany({ where: { OR: [{ countryId: { in: countryIds } }, { productId: { in: productIds } }] } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.country.deleteMany({ where: { id: { in: countryIds } } });

  const smokeFlags = await prisma.featureFlag.findMany({
    where: { reason: { contains: "runtime smoke" } },
    select: { id: true }
  });
  const smokeFlagIds = smokeFlags.map((flag) => flag.id);
  await prisma.featureFlagHistory.deleteMany({ where: { featureFlagId: { in: smokeFlagIds } } });
  await prisma.featureFlag.deleteMany({ where: { id: { in: smokeFlagIds } } });
}
