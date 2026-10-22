import type {
  ActivationAttestationCreateDto,
  ActivationAttestationListResponse,
  ActivationAttestationRecord,
  ActivationAttestationRevokeDto,
  ActivationAttestationScope
} from "../../../../packages/shared/contracts/activation-checklist.contracts";
import type { ActorContext } from "../common/types";
import type { ActivationAttestationsService } from "./activation-attestations.service";

/**
 * Spec 070 PRD 35/36. Role (compliance_admin or super_admin) and MFA are enforced and audited by the
 * service, which refuses with `ActivationChecklistAccessRefusedError` / `ActivationAttestationRefusedError`.
 */
export class ActivationAttestationsController {
  constructor(private readonly attestations: ActivationAttestationsService) {}

  list(actor: ActorContext, scope: ActivationAttestationScope): Promise<ActivationAttestationListResponse> {
    return this.attestations.list(actor, scope);
  }

  attest(actor: ActorContext, input: ActivationAttestationCreateDto): Promise<ActivationAttestationRecord> {
    return this.attestations.attest(actor, input);
  }

  revoke(actor: ActorContext, input: ActivationAttestationRevokeDto): Promise<ActivationAttestationRecord> {
    return this.attestations.revoke(actor, input);
  }
}
