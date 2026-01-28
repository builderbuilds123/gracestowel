import StripePartialCaptureService from "./service"
import { ModuleProvider, Modules } from "@medusajs/framework/utils"

export default ModuleProvider(Modules.PAYMENT, {
    // Cast required: provider expects a constructor type that StripeBase's protected constructor does not satisfy.
    services: [StripePartialCaptureService as any],
})
