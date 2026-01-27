import StripePartialCaptureService from "./service"
import { ModuleProvider, Modules } from "@medusajs/framework/utils"

export default ModuleProvider(Modules.PAYMENT, {
    // StripeBase has a protected constructor, so the type doesn't satisfy
    // Constructor<any> directly. The runtime works correctly.
    services: [StripePartialCaptureService as any],
})
