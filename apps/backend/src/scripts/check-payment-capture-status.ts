
import { ExecArgs } from "@medusajs/framework/types";
import { getPaymentCaptureQueue, getJobState } from "../lib/payment-capture-queue";
import { getStripeClient } from "../utils/stripe";

export default async function checkPaymentCaptureStatus({ container }: ExecArgs) {
  const query = container.resolve("query");
  const stripe = getStripeClient();

  // Get the latest order with payment collections
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id", 
      "status", 
      "payment_status", 
      "total", 
      "created_at", 
      "metadata", 
      "currency_code", 
      "region_id",
      "payment_collections.id",
      "payment_collections.status",
      "payment_collections.amount",
      "payment_collections.currency_code",
      "payment_collections.payments.id",
      "payment_collections.payments.amount",
      "payment_collections.payments.currency_code",
      "payment_collections.payments.data"
    ],
    pagination: {
      order: {
        created_at: "DESC"
      },
      take: 1
    }
  });

  if (orders.length === 0) {
    console.log("❌ No orders found.");
    return;
  }

  const order = orders[0] as any;
  const orderId = order.id;
  const paymentIntentId = order.metadata?.stripe_payment_intent_id;

  console.log("=".repeat(60));
  console.log("📦 ORDER INFORMATION");
  console.log("=".repeat(60));
  console.log(`Order ID: ${orderId}`);
  console.log(`Status: ${order.status}`);
  console.log(`Payment Status (direct field): ${order.payment_status || "undefined"}`);
  console.log(`Payment Status (metadata): ${order.metadata?.payment_status || "undefined"}`);
  console.log(`Total: ${order.total} ${order.currency_code}`);
  console.log(`Created At: ${order.created_at}`);
  console.log(`Payment Intent ID (metadata): ${paymentIntentId || "NOT FOUND"}`);

  // Check Payment Collections
  console.log("\n" + "=".repeat(60));
  console.log("💰 PAYMENT COLLECTIONS");
  console.log("=".repeat(60));
  const paymentCollections = order.payment_collections || [];
  if (paymentCollections.length === 0) {
    console.log("❌ No Payment Collections found for this order");
    console.log("   This is the issue - Medusa v2 requires Payment Collections to track payment status");
  } else {
    paymentCollections.forEach((pc: any, index: number) => {
      console.log(`\nPayment Collection ${index + 1}:`);
      console.log(`  ID: ${pc.id}`);
      console.log(`  Status: ${pc.status || "undefined"}`);
      console.log(`  Amount: ${pc.amount || "undefined"} ${pc.currency_code || ""}`);
      console.log(`  Payments: ${pc.payments?.length || 0}`);
      
      if (pc.payments && pc.payments.length > 0) {
        pc.payments.forEach((payment: any, pIndex: number) => {
          console.log(`    Payment ${pIndex + 1}:`);
          console.log(`      ID: ${payment.id}`);
          console.log(`      Amount: ${payment.amount || "undefined"} ${payment.currency_code || ""}`);
          const paymentData = payment.data as any;
          if (paymentData) {
            console.log(`      Provider Data:`);
            console.log(`        Stripe PI ID: ${paymentData.id || "N/A"}`);
            console.log(`        Stripe Status: ${paymentData.status || "N/A"}`);
            console.log(`        Amount Received: ${paymentData.amount_received || "N/A"}`);
          }
        });
      }
    });
  }

  if (!paymentIntentId) {
    console.log("\n❌ No Stripe PaymentIntent ID found in order metadata");
    return;
  }

  // Check Stripe PaymentIntent status
  console.log("\n" + "=".repeat(60));
  console.log("💳 STRIPE PAYMENT INTENT STATUS");
  console.log("=".repeat(60));
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    console.log(`Status: ${paymentIntent.status}`);
    console.log(`Amount: ${paymentIntent.amount} ${paymentIntent.currency.toUpperCase()}`);
    console.log(`Amount Capturable: ${paymentIntent.amount_capturable}`);
    console.log(`Amount Received: ${paymentIntent.amount_received || 0}`);
    
    if (paymentIntent.status === "requires_capture") {
      console.log("✅ Payment is authorized and ready for capture");
    } else if (paymentIntent.status === "succeeded") {
      console.log("✅ Payment has been captured");
    } else {
      console.log(`⚠️  Payment status: ${paymentIntent.status}`);
    }
  } catch (error: any) {
    console.log(`❌ Error retrieving PaymentIntent: ${error.message}`);
  }

  // Check BullMQ capture job status
  console.log("\n" + "=".repeat(60));
  console.log("⏰ PAYMENT CAPTURE JOB STATUS (BullMQ)");
  console.log("=".repeat(60));
  try {
    const queue = getPaymentCaptureQueue();
    const job = await queue.getJob(`capture-${orderId}`);
    
    if (!job) {
      console.log("❌ No capture job found for this order");
      console.log("   This could mean:");
      console.log("   - Job hasn't been scheduled yet");
      console.log("   - Job was already completed and removed");
      console.log("   - Job was canceled");
    } else {
      const state = await job.getState();
      const jobData = job.data;
      const opts = job.opts;
      
      console.log(`Job ID: ${job.id}`);
      console.log(`State: ${state}`);
      console.log(`Order ID: ${jobData.orderId}`);
      console.log(`Payment Intent ID: ${jobData.paymentIntentId}`);
      
      if (opts.delay) {
        const delaySeconds = opts.delay / 1000;
        const delayMinutes = Math.round(delaySeconds / 60);
        const scheduledTime = new Date(job.timestamp + opts.delay).toISOString();
        console.log(`Delay: ${delayMinutes} minutes (${delaySeconds} seconds)`);
        console.log(`Scheduled Capture Time: ${scheduledTime}`);
        
        if (state === "delayed") {
          const now = Date.now();
          const timeUntilCapture = (job.timestamp + opts.delay) - now;
          const minutesLeft = Math.round(timeUntilCapture / 1000 / 60);
          const secondsLeft = Math.round(timeUntilCapture / 1000);
          console.log(`⏳ Time until capture: ${minutesLeft} minutes (${secondsLeft} seconds)`);
        }
      }
      
      if (state === "completed") {
        console.log("✅ Capture job has completed");
        console.log(`   Completed at: ${job.processedOn ? new Date(job.processedOn).toISOString() : "N/A"}`);
      } else if (state === "failed") {
        console.log("❌ Capture job has failed");
        console.log(`   Failed at: ${job.failedReason || "N/A"}`);
        if (job.stacktrace) {
          console.log(`   Error: ${job.stacktrace[0] || "N/A"}`);
        }
      } else if (state === "active") {
        console.log("🔄 Capture job is currently being processed");
      } else if (state === "waiting") {
        console.log("⏳ Capture job is waiting to be processed");
      } else if (state === "delayed") {
        console.log("⏸️  Capture job is delayed (scheduled for future)");
      }
    }
    
    // Also check using getJobState helper
    const jobState = await getJobState(orderId);
    console.log(`\nJob State (via helper): ${jobState}`);
    
  } catch (error: any) {
    console.log(`❌ Error checking job status: ${error.message}`);
    console.log(`   Make sure REDIS_URL is configured`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ Status check complete");
  console.log("=".repeat(60));
}
