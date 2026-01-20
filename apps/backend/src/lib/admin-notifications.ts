import { Modules } from "@medusajs/framework/utils"
import type { MedusaContainer, Logger } from "@medusajs/framework/types"
import type { INotificationModuleService } from "@medusajs/framework/types"

export enum AdminNotificationType {
  ORDER_PLACED = "order_placed",
  ORDER_CANCELED = "order_canceled",
  INVENTORY_BACKORDER = "inventory_backorder",
  FULFILLMENT_CREATED = "fulfillment_created",
  CUSTOMER_CREATED = "customer_created",
  PAYMENT_FAILED = "payment_failed",
}

export interface AdminNotificationData {
  type: AdminNotificationType
  title: string
  description: string
  metadata?: Record<string, unknown>
}

type MinimalLogger = Pick<Logger, "info" | "error">
let logger: MinimalLogger = console

/**
 * Initializes the admin notifications module with access to the logger.
 * Should be called during application startup.
 */
export function initAdminNotifications(container: MedusaContainer): void {
  try {
    logger = container.resolve("logger")
  } catch {
    logger = console
  }
}

/**
 * Sends an admin notification to the Medusa admin dashboard feed.
 * Uses the local notification provider with the "feed" channel.
 *
 * @param container - The Medusa container
 * @param data - The notification data
 */
export async function sendAdminNotification(
  container: MedusaContainer,
  data: AdminNotificationData
): Promise<void> {
  try {
    const notificationService = container.resolve<INotificationModuleService>(
      Modules.NOTIFICATION
    )

    await notificationService.createNotifications({
      to: "",
      channel: "feed",
      template: "admin-ui",
      data: {
        title: data.title,
        description: data.description,
        ...data.metadata,
      },
    })

    logger.info(
      `[ADMIN_NOTIF][SENT] type=${data.type} title="${data.title}"`
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      `[ADMIN_NOTIF][ERROR] Failed to send notification type=${data.type}: ${message}`
    )
  }
}
