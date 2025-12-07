import { getPaymentCaptureQueue } from "../lib/payment-capture-queue";
import { loadEnv } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || 'development', process.cwd());

async function verifyQueue() {
    console.log("Verifying Payment Capture Queue...");

    try {
        const queue = getPaymentCaptureQueue();
        await queue.waitUntilReady();
        console.log("✅ Queue initialized successfully.");

        // Check connection
        const client = await queue.client;
        const ping = await client.ping();
        console.log(`✅ Redis PING response: ${ping}`);

        // Check job counts
        const counts = await queue.getJobCounts();
        console.log("Job Counts:", counts);

        // Add a test job to verify write access
        const testJob = await queue.add("test-verification", {
            orderId: "test_verification",
            paymentIntentId: "pi_test",
            scheduledAt: Date.now()
        }, {
            removeOnComplete: true
        });
        console.log(`✅ Test job added with ID: ${testJob.id}`);

        process.exit(0);
    } catch (error) {
        console.error("❌ verification failed:", error);
        process.exit(1);
    }
}

verifyQueue();
