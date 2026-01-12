
import { MedusaError } from "@medusajs/framework/utils"

export class MissingPaymentCollectionError extends MedusaError {
  constructor(message: string) {
    super(MedusaError.Types.INVALID_DATA, message);
    this.name = "MissingPaymentCollectionError";
  }
}
