import { AbstractNotificationProviderService } from "@medusajs/framework/utils"
import { ProviderSendNotificationDTO, ProviderSendNotificationResultsDTO } from "@medusajs/framework/types"
import { Resend } from "resend"
import { render } from "@react-email/components"
import { orderPlacedEmail } from "./emails/order-placed"
import { welcomeEmail } from "./emails/welcome"
import { shippingConfirmationEmail } from "./emails/shipping-confirmation"
import { orderCanceledEmail } from "./emails/order-canceled"
import { passwordResetEmail } from "./emails/password-reset"

// Template types enum
export enum Templates {
  ORDER_PLACED = "order-placed",
  WELCOME = "welcome",
  SHIPPING_CONFIRMATION = "shipping-confirmation",
  ORDER_CANCELED = "order-canceled",
  PASSWORD_RESET = "password-reset",
}

// Template mapping
const templates: { [key in Templates]?: (props: unknown) => React.ReactElement } = {
  [Templates.ORDER_PLACED]: orderPlacedEmail,
  [Templates.WELCOME]: welcomeEmail,
  [Templates.SHIPPING_CONFIRMATION]: shippingConfirmationEmail,
  [Templates.ORDER_CANCELED]: orderCanceledEmail,
  [Templates.PASSWORD_RESET]: passwordResetEmail,
}

// Module options interface
interface ResendModuleOptions {
  api_key?: string
  from?: string
  test_mode?: boolean
  html_templates?: Record<string, { subject?: string; content: string }>
}

class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "notification-resend"
  private resend: Resend | null
  private from: string
  private testMode: boolean
  private logger: any // simplistic logger type if not resolved from container

  constructor(container: Record<string, unknown>, options: ResendModuleOptions) {
    super()
    this.testMode = options.test_mode === true
    // We can access logger from container if needed, usually container.logger
    this.logger = container.logger || console

    if (this.testMode) {
      this.logger.info("Resend: Running in test mode (explicitly configured)")
      this.resend = null
      this.from = "test@example.com"
    } else if (!options.api_key) {
      this.logger.warn("Resend: No API key provided, provider will be disabled")
      this.resend = null
      this.from = options.from || "onboarding@resend.dev"
    } else {
      this.resend = new Resend(options.api_key)
      this.from = options.from || "onboarding@resend.dev"
    }
  }

  static validateOptions(options: ResendModuleOptions) {
    if (options.test_mode) {
      return
    }

    if (!options.api_key) {
      throw new Error("Resend API key is required")
    }
    if (!options.from) {
      throw new Error("Resend from email is required")
    }
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split("@")
    if (!local || !domain) return "unknown@***"
    const visible = local.slice(0, 1)
    return `${visible}***@***`
  }

  async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    const maskedTo = this.maskEmail(notification.to)

    if (this.testMode || !this.resend) {
      this.logger.info(`Resend [TEST]: Would send ${notification.template} email to ${maskedTo}`)
      return { id: "test-mode-skipped" }
    }

    const template = templates[notification.template as Templates]

    if (!template) {
      this.logger.warn(`Resend: No template found for ${notification.template}, skipping email`)
      return { id: "skipped" }
    }

    const emailComponent = template(notification.data)
    const html = await render(emailComponent)

    try {
      const subject = this.getSubject(notification.template as Templates, notification.data || {})

      // Safe logging
      this.logger.info(`Resend: Sending ${notification.template} to ${maskedTo} [Subject: ${subject}]`)
      // Do NOT log full data object

      const result = await this.resend.emails.send({
        from: this.from,
        to: notification.to,
        subject,
        html,
      })

      if (result.error) {
        const status = (result.error as any).status || (result.error as any).statusCode || 500
        this.logger.error(`Resend error for ${notification.template} to ${maskedTo}: ${result.error.message} [Status: ${status}]`)
        
        // Wrap error to include status for BullMQ worker
        const error: any = new Error(result.error.message)
        error.statusCode = status
        throw error
      }

      this.logger.info(`Resend: Email sent successfully. ID: ${result.data?.id}`)
      return { id: result.data?.id || "sent" }
    } catch (error: any) {
      if (!error.statusCode) {
        // Map common network/auth errors if possible
        if (error.message?.includes("API key")) error.statusCode = 401
      }
      this.logger.error(`Resend: Failed to send email to ${maskedTo}: ${error.message}`)
      throw error
    }
  }

  private getSubject(template: Templates, data: Record<string, unknown>): string {
    switch (template) {
      case Templates.ORDER_PLACED:
        return `Order Confirmation - Grace Stowel #${(data as { order?: { display_id?: string } }).order?.display_id || ""}`
      case Templates.WELCOME:
        return `Welcome to Grace Stowel!`
      case Templates.SHIPPING_CONFIRMATION:
        return `Your Order Has Shipped - Grace Stowel #${(data as { order?: { display_id?: string } }).order?.display_id || ""}`
      case Templates.ORDER_CANCELED:
        return `Order Canceled - Grace Stowel #${(data as { order?: { display_id?: string } }).order?.display_id || ""}`
      case Templates.PASSWORD_RESET:
        return `Reset Your Password - Grace Stowel`
      default:
        return "Grace Stowel Notification"
    }
  }
}

export default ResendNotificationProviderService

