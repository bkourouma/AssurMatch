import type { NotificationDto } from "../../../../packages/shared/contracts/ops.contracts";
import { RbacGuard } from "../auth/guards/rbac.guard";
import type { ActorContext } from "../common/types";
import { NotificationsService, type NotificationRecord } from "./notifications.module";

export class AdminNotificationsController {
  private readonly rbac = new RbacGuard();

  constructor(private readonly notifications: NotificationsService) {}

  list(actor: ActorContext): NotificationRecord[] {
    this.rbac.assert(actor, "notifications:read");
    return this.notifications.list();
  }

  listQuoteNotifications(actor: ActorContext): NotificationRecord[] {
    this.rbac.assert(actor, "notifications:read");
    return this.notifications.list().filter((notification) =>
      notification.type === "visitor_quote_confirmation" ||
      notification.type === "visitor_quote_non_routable" ||
      notification.type === "broker_lead_assigned" ||
      notification.type === "quote_notification_failed"
    );
  }

  test(actor: ActorContext, input: NotificationDto) {
    this.rbac.assert(actor, "notifications:create");
    return this.notifications.queuePaired(input, actor);
  }
}
