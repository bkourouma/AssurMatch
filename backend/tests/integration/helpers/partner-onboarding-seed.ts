import type { ActorContext } from "../../../src/modules/common/types";
import type { AccreditationDocument, DocumentsService } from "../../../src/modules/documents/documents.module";
import type { PartnersService } from "../../../src/modules/partners/partners.module";
import type { UsersService } from "../../../src/modules/users/users.module";

/** Smallest byte sequence that passes the PDF signature check (`%PDF`). */
export const MINIMAL_PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n", "latin1");
/** The standard EICAR antivirus test string, behind a PDF header so it passes the MIME and signature checks. */
export const EICAR_PDF = Buffer.from("%PDF-1.4\nX5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*\n%%EOF\n", "latin1");

const SEED_ACTOR: ActorContext = { actorId: "admin-runtime", roles: ["super_admin"], mfaVerified: true };

export function pdfFile(bytes: Buffer = MINIMAL_PDF, originalname = "agrement.pdf") {
  return { buffer: bytes, originalname, mimetype: "application/pdf", size: bytes.length };
}

interface OnboardingRuntime {
  documents: { service: DocumentsService };
  partners: { service: PartnersService };
  users: { service: UsersService };
}

/**
 * Spec 051 R14 / R15: routing now reads persisted accreditation documents (accepted AND clean).
 * Seeds that create a routable partner call this so the partner keeps its eligibility.
 */
export async function seedAcceptedAccreditation(runtime: Pick<OnboardingRuntime, "documents">, partnerTenantId: string, licenseId?: string, actor: ActorContext = SEED_ACTOR): Promise<AccreditationDocument> {
  const uploaded = await runtime.documents.service.upload(actor, partnerTenantId, pdfFile(), {
    documentType: "license",
    ...(licenseId ? { licenseId } : {}),
    reason: "seed accreditation proof"
  });
  return runtime.documents.service.review(uploaded.id, "accepted", "seed accreditation proof accepted", actor);
}

/** Owner user (invited) and recorded contract with a clean signed document: the remaining activation conditions. */
export async function seedOwnerAndContract(runtime: OnboardingRuntime, partnerTenantId: string, options: { ownerEmail?: string; plan?: "starter" | "pro" | "enterprise" } = {}, actor: ActorContext = SEED_ACTOR) {
  const owner = await runtime.users.service.create({
    email: options.ownerEmail ?? `owner-${partnerTenantId.slice(0, 8)}@broker.example`,
    displayName: "Owner Courtier",
    roles: [options.plan === "starter" ? "broker_owner_starter" : "broker_owner_pro"],
    partnerTenantId,
    scopes: { countryIds: [], productIds: [] }
  }, actor);
  const signed = await runtime.documents.service.upload(actor, partnerTenantId, pdfFile(MINIMAL_PDF, "contrat-signe.pdf"), {
    documentType: "partnership_contract",
    reason: "seed signed partnership contract"
  });
  const contract = await runtime.partners.service.recordContract({
    partnerTenantId,
    version: "v1",
    signedAt: "2026-01-15",
    signatoryName: "Signataire Courtier",
    documentId: signed.id,
    recordedById: actor.actorId ?? null
  }, "seed partnership contract", actor);
  return { owner, contract, signedDocument: signed };
}
