import { BuiltInPasswordDenyList } from "./password-deny-list";

export interface PasswordPolicySubject {
  email?: string;
  displayName?: string;
}

export class PasswordPolicyService {
  assertAcceptable(password: string, subject: PasswordPolicySubject = {}): void {
    if (password.length < 12) throw new Error("Password must be at least 12 characters");
    if (password.length > 512) throw new Error("Password must be at most 512 characters");
    const normalized = password.trim().toLowerCase();
    if (subject.email && normalized === subject.email.trim().toLowerCase()) throw new Error("Password must not match email");
    if (subject.displayName && normalized === subject.displayName.trim().toLowerCase()) throw new Error("Password must not match display name");
    if (BuiltInPasswordDenyList.has(normalized)) throw new Error("Password is too common");
  }
}
