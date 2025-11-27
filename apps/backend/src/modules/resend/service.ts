import { AbstractNotificationProviderService } from "@medusajs/framework/utils"
import { ProviderSendNotificationDTO, ProviderSendNotificationResultsDTO } from "@medusajs/framework/types"
import { Resend } from "resend"
import { render } from "@react-email/components"
import { orderPlacedEmail } from "./emails/order-placed"
import { welcomeEmail } from "./emails/welcome"
import { shippingConfirmationEmail } from "./emails/shipping-confirmation"
import { orderCanceledEmail } from "./emails/order-canceled"

// Template types enum
export enum Templates {
  ORDER_PLACED = "order-placed",
  WELCOME = "welcome",
  SHIPPING_CONFIRMATION = "shipping-confirmation",
  ORDER_CANCELED = "order-canceled",
}

// Template mapping
const templates: { [key in Templates]?: (props: unknown) => React.ReactElement } = {
  [Templates.ORDER_PLACED]: orderPlacedEmail,
  [Templates.WELCOME]: welcomeEmail,
  [Templates.SHIPPING_CONFIRMATION]: shippingConfirmationEmail,
  [Templates.ORDER_CANCELED]: orderCanceledEmail,
}

// Module options interface
interface ResendModuleOptions {
  api_key?: string
  from?: string
}

// Check if we're in test mode (no API key provided)
const isTestMode = () => !process.env.RESEND_API_KEY

class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "resend"
  private resend: Resend | null
  private from: string
  private testMode: boolean

  constructor(container: Record<string, unknown>, options: ResendModuleOptions) {
    super()
    this.testMode = isTestMode()

    if (this.testMode) {
      console.log("Resend: Running in test mode (no API key provided)")
      this.resend = null
      this.from = "test@example.com"
    } else {
      this.resend = new Resend(options.api_key)
      this.from = options.from || "onboarding@resend.dev"
    }
  }

  static validateOptions(options: ResendModuleOptions) {
    // Skip validation in test mode
    if (isTestMode()) {
      console.log("Resend: Skipping validation in test mode")
      return
    }

    if (!options.api_key) {
      throw new Error("Resend API key is required")
    }
    if (!options.from) {
      throw new Error("Resend from email is required")
    }
  }

  async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
    // In test mode, just log and return success
    if (this.testMode || !this.resend) {
      console.log(`Resend [TEST MODE]: Would send ${notification.template} email to ${notification.to}`)
      return { id: "test-mode-skipped" }
    }

    const template = templates[notification.template as Templates]

    if (!template) {
      console.warn(`No template found for ${notification.template}, skipping email`)
      return { id: "skipped" }
    }

    const emailComponent = template(notification.data)
    const html = await render(emailComponent)

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to: notification.to,
        subject: this.getSubject(notification.template as Templates, notification.data || {}),
        html,
      })

      if (error) {
        console.error("Resend error:", error)
        throw new Error(`Failed to send email: ${error.message}`)
      }

      console.log(`Email sent successfully: ${data?.id}`)
      return { id: data?.id || "sent" }
    } catch (error) {
      console.error("Failed to send email:", error)
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
      default:
        return "Grace Stowel Notification"
    }
  }
}

export default ResendNotificationProviderService

