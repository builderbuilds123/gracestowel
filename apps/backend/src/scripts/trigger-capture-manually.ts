import { ExecArgs } from "@medusajs/types";
import { schedulePaymentCapture } from "../lib/payment-capture-queue";

export default async function({ container }: ExecArgs) {
  const ORDER_ID = "order_01KCTABKJN129VJXV95EWP2A4Y";
  const PAYMENT_INTENT_ID = "pi_3SfuLbPAvLfNBsYS2DkDc133"; // From check-latest-order.ts

  console.log(`[MANUAL] Scheduling payment capture for ${ORDER_ID} (PI: ${PAYMENT_INTENT_ID})...`);

  try {
      const { getPaymentCaptureQueue } = require("../lib/payment-capture-queue");
      const queue = getPaymentCaptureQueue();
      const existingJob = await queue.getJob(`capture-${ORDER_ID}`);
      if (existingJob) {
          console.log("[MANUAL] Removing existing job...");
          await existingJob.remove();
      }

      await schedulePaymentCapture(ORDER_ID, PAYMENT_INTENT_ID, 0);
      console.log("[MANUAL] Successfully scheduled.");
  } catch (e) {
      console.error("[MANUAL] Failed to schedule:", e);
      process.exit(1);
  }
}

