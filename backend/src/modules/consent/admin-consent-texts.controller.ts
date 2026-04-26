import type { ConsentTextDto } from "../../../../packages/shared/contracts/compliance.contracts";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { ConsentService, type ConsentText } from "./consent.module";

export class AdminConsentTextsController {
  private readonly rbac = new RbacGuard();

  constructor(private readonly consent: ConsentService) {}

  list(actor: ActorContext): Promise<ConsentText[]> {
    this.rbac.assert(actor, "consent:read");
    return this.consent.listTexts();
  }

  create(actor: ActorContext, input: ConsentTextDto): Promise<ConsentText> {
    this.rbac.assert(actor, "consent:create");
    return this.consent.createText(input, actor);
  }

  publish(actor: ActorContext, id: string): Promise<ConsentText> {
    this.rbac.assert(actor, "consent:approve");
    return this.consent.publishText(id, actor);
  }
}
