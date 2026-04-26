interface Delegate<T> {
  count(input?: unknown): Promise<number>;
  deleteMany(input?: unknown): Promise<unknown>;
  findFirst(input?: unknown): Promise<T | null>;
  findMany(input?: unknown): Promise<T[]>;
  findUnique(input: unknown): Promise<T | null>;
}

interface IdRow {
  id: string;
}

export interface RuntimeSmokePrismaClient {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  auditLog: Delegate<{ id: string; correlationId: string | null }>;
  brokerCrmAiAssistRequest: Delegate<IdRow>;
  brokerCrmDispute: Delegate<IdRow>;
  brokerCrmDocument: Delegate<IdRow>;
  brokerCrmLeadState: Delegate<IdRow>;
  brokerCrmNote: Delegate<IdRow>;
  brokerCrmPipelineHistory: Delegate<IdRow>;
  brokerCrmProposal: Delegate<IdRow>;
  brokerCrmReminder: Delegate<IdRow>;
  brokerCrmTask: Delegate<IdRow>;
  consentRecord: Delegate<IdRow>;
  consentText: Delegate<IdRow>;
  country: Delegate<IdRow>;
  countryProduct: Delegate<IdRow>;
  featureFlag: Delegate<{ id: string; key: string; value: boolean }>;
  featureFlagHistory: Delegate<IdRow>;
  leadActionHistory: Delegate<IdRow>;
  leadAssignment: Delegate<{ id: string; brokerNotificationId: string | null }>;
  notification: Delegate<IdRow>;
  offer: Delegate<{ id: string; name: string }>;
  offerHistory: Delegate<IdRow>;
  partnerCountryAuthorization: Delegate<IdRow>;
  partnerLicense: Delegate<IdRow>;
  partnerProductAuthorization: Delegate<IdRow>;
  partnerTenant: Delegate<IdRow>;
  product: Delegate<IdRow>;
  prospect: Delegate<IdRow>;
  queueJobRecord: Delegate<IdRow>;
  quoteFormDefinition: Delegate<IdRow>;
  quoteRequest: Delegate<{ id: string; prospectId: string; consentRecordId: string }>;
  routingDecision: Delegate<IdRow>;
}

interface PrismaClientModule {
  PrismaClient?: new (input?: unknown) => RuntimeSmokePrismaClient;
}

interface PrismaPgModule {
  PrismaPg: new (input: string) => unknown;
}

export async function createRuntimeSmokePrismaClient(_databaseUrl: string): Promise<RuntimeSmokePrismaClient> {
  const adapterModule = await import("@prisma/adapter-pg") as unknown as PrismaPgModule;
  const prismaModule = await import("@prisma/client") as unknown as PrismaClientModule;
  if (!prismaModule.PrismaClient) throw new Error("@prisma/client PrismaClient is not available");
  const client = new prismaModule.PrismaClient({ adapter: new adapterModule.PrismaPg(_databaseUrl) });
  await client.$connect();
  return client;
}
