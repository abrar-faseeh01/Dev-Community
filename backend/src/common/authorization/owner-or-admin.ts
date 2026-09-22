import { ForbiddenException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/schemas/audit-log.schema';
import { NotificationsService } from '../../notifications/notifications.service';

export type RequestUser = {
  userId: string;
  fullName: string;
  email: string;
  role: string;
};

// Shared by every owner-or-admin write route across controllers — same
// check, one place, rather than a copy per controller. `resource` defaults
// to 'profile' so every existing caller (which never passed a third arg)
// keeps its exact original message; PostsController passes 'post'.
export function assertOwnerOrAdmin(
  requester: RequestUser,
  targetUserId: string,
  resource: string = 'profile',
) {
  if (requester.userId !== targetUserId && requester.role !== 'admin') {
    throw new ForbiddenException(`You can only edit your own ${resource}`);
  }
}

// Distinguishes "an admin acting on someone else" (audit-logged and
// notified) from "you editing your own data" (neither) — assertOwnerOrAdmin
// above only tells us the request is *allowed*, not which of those two
// allowed cases it actually is.
export function isAdminOverride(
  requester: RequestUser,
  targetUserId: string,
) {
  return requester.userId !== targetUserId && requester.role === 'admin';
}

// Shared by every admin-override write once isAdminOverride is true — one
// place for "log it, and notify the target unless they no longer exist"
// rather than a near-identical call site per controller. Services are
// passed in explicitly (rather than this module owning its own injectable)
// since each caller already has them constructor-injected.
export async function recordAdminOverride(
  services: {
    auditService: AuditService;
    notificationsService: NotificationsService;
  },
  requester: RequestUser,
  // `exists: false` means the target's account has been deleted: the audit
  // entry is still written (with whatever name the caller supplies), but
  // there is nobody to notify. Omitted means the account exists.
  target: { id: string; fullName: string; exists?: boolean },
  action: AuditAction,
  previousState: Record<string, unknown> | null,
  newState: Record<string, unknown> | null,
  // Base message only — callers never build the reason suffix themselves,
  // so every caller's wording stays consistent and this stays the one
  // place that decides how a reason is appended.
  message: string,
  reason?: string,
) {
  await services.auditService.log({
    adminId: requester.userId,
    adminFullName: requester.fullName,
    targetUserId: target.id,
    targetFullName: target.fullName,
    action,
    previousState,
    newState,
    reason,
  });

  if (target.exists === false) return;

  const notificationMessage = reason ? `${message} Reason: ${reason}` : message;
  await services.notificationsService.create(target.id, notificationMessage);
}
