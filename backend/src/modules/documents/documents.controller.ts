import type { AccreditationDocumentDto } from "../../../../packages/shared/contracts/partner.contracts";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { DocumentsService, type AccreditationDocument } from "./documents.module";

export class DocumentsController {
  private readonly rbac = new RbacGuard();

  constructor(private readonly documents: DocumentsService) {}

  register(actor: ActorContext, input: AccreditationDocumentDto): AccreditationDocument {
    this.rbac.assert(actor, "documents:create", { partnerTenantId: input.partnerTenantId });
    return this.documents.register(input, actor);
  }

  get(actor: ActorContext, id: string): AccreditationDocument {
    this.rbac.assert(actor, "documents:read");
    return this.documents.getAuthorized(id, actor);
  }
}
