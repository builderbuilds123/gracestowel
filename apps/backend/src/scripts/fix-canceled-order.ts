import { refundPaymentsWorkflow } from "@medusajs/core-flows"

export default async function fixOrder({ container }) {
  const paymentId = "pay_01KEQZ3107JE2HW6RME3Z1HM7N"
  const amount = 192
  
  console.log(`[FIX] Recording refund for payment ${paymentId} (amount: ${amount}) in Medusa...`)
  
  try {
    const { result } = await refundPaymentsWorkflow(container).run({
      input: [
        {
          payment_id: paymentId,
          amount: amount
        }
      ]
    })
    
    console.log("[FIX] Success!", result)
  } catch (error: any) {
    console.error("[FIX] Failed:", error.message)
    if (error.cause) console.error("[FIX] Cause:", error.cause)
  }
}
