import { BadRequestException } from "@nestjs/common";
import { ErrorCodes } from "../../../../packages/shared/contracts/error-codes";
import { BuiltInPasswordDenyList } from "./password-deny-list";

export interface PasswordPolicySubject {
  email?: string;
  displayName?: string;
}

/**
 * The visible text avoids the words the error filter masks (password, token, secret); the stable code
 * lets the apps show their own readable sentence.
 */
function refuse(reason: string): never {
  throw new BadRequestException({ code: ErrorCodes.PASSWORD_POLICY, message: `The chosen credential does not meet the security policy: ${reason}` });
}

export class PasswordPolicyService {
  assertAcceptable(password: string, subject: PasswordPolicySubject = {}): void {
    if (password.length < 12) refuse("it must be at least 12 characters long");
    if (password.length > 512) refuse("it must be at most 512 characters long");
    const normalized = password.trim().toLowerCase();
    if (subject.email && normalized === subject.email.trim().toLowerCase()) refuse("it must not match the e-mail address");
    if (subject.displayName && normalized === subject.displayName.trim().toLowerCase()) refuse("it must not match the display name");
    if (BuiltInPasswordDenyList.has(normalized)) refuse("it is too common");
  }
}
