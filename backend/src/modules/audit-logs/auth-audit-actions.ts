export const AuthAuditActions = {
  userCreated: "user.created",
  userUpdated: "user.updated",
  userActivated: "user.activated",
  userPasswordChanged: "user.password_changed",
  userPasswordChangeFailed: "user.password_change_failed",
  userPasswordChangeRequired: "user.password_change_required",
  userPasswordResetIssued: "user.password_reset_issued",
  userPasswordResetConsumed: "user.password_reset_consumed",
  userPasswordResetInvalid: "user.password_reset_invalid",
  userMfaEnrolled: "user.mfa_enrolled",
  userMfaReset: "user.mfa_reset",
  userMfaVerified: "user.mfa_verified",
  userMfaFailed: "user.mfa_failed",
  userLoginSucceeded: "user.login_succeeded",
  userLoginFailed: "user.login_failed",
  userLoginRefusedSuspended: "user.login_refused_suspended",
  userLockedAfterFailedLogins: "user.locked_after_failed_logins",
  userSuspended: "user.suspended",
  userUnsuspended: "user.unsuspended",
  userLocked: "user.locked",
  userUnlocked: "user.unlocked",
  userDeleted: "user.deleted",
  userRoleChanged: "user.role_changed",
  localBootstrapAdminCreated: "local_bootstrap_admin.created",
  localBootstrapAdminRefusedInProduction: "local_bootstrap_admin.refused_in_production"
} as const;

export type AuthAuditAction = (typeof AuthAuditActions)[keyof typeof AuthAuditActions];
