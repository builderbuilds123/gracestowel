import { ExecArgs } from "@medusajs/types";
import { startPaymentCaptureWorker } from "../workers/payment-capture-worker";

export default async function({ container }: ExecArgs) {
  console.log("Starting Payment Capture Worker manually...");
  
  try {
      startPaymentCaptureWorker(container);
      console.log("Worker started successfully. Waiting for jobs...");
  } catch (e) {
      console.error("Failed to start worker:", e);
      process.exit(1);
  }
  
  // Keep alive forever
  await new Promise(() => {}); 
}
