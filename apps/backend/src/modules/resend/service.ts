import { AbstractNotificationProviderService } from "@medusajs/framework/utils"
import { ProviderSendNotificationDTO, ProviderSendNotificationResultsDTO } from "@medusajs/framework/types"
import { Resend } from "resend"
import { render } from "@react-email/components"
import { orderPlacedEmail } from "./emails/order-placed"

// Template types enum
export enum Templates {
  ORDER_PLACED = "order-placed",
}

// Template mapping
const templates: { [key in Templates]?: (props: unknown) => React.ReactElement } = {
  [Templates.ORDER_PLACED]: orderPlacedEmail,
}

// Module options interface
interface ResendModuleOptions {
  api_key: string
  from: string
}

class ResendNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "resend"
  private resend: Resend
  private from: string

  constructor(container: Record<string, unknown>, options: ResendModuleOptions) {
    super()
    this.resend = new Resend(options.api_key)
    this.from = options.from
  }

  static validateOptions(options: ResendModuleOptions) {
    if (!options.api_key) {
      throw new Error("Resend API key is required")
    }
    if (!options.from) {
      throw new Error("Resend from email is required")
    }
  }

  async send(notification: ProviderSendNotificationDTO): Promise<ProviderSendNotificationResultsDTO> {
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
        subject: this.getSubject(notification.template as Templates, notification.data),
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
      default:
        return "Grace Stowel Notification"
    }
  }
}

export default ResendNotificationProviderService

