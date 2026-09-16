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
// check, one place, rather than a copy per controller.
export function assertOwnerOrAdmin(
  requester: RequestUser,
  targetUserId: string,
) {
  if (requester.userId !== targetUserId && requester.role !== 'admin') {
    throw new ForbiddenException('You can only edit your own profile');
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
  target: { id: string; fullName: string },
  action: AuditAction,
  previousState: Record<string, unknown> | null,
  newState: Record<string, unknown> | null,
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

  const message = reason
    ? `An administrator updated your profile. Reason: ${reason}`
    : 'An administrator updated your profile.';
  await services.notificationsService.create(target.id, message);
}
