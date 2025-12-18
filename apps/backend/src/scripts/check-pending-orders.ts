/**
 * Script to check pending orders in the queue
 */
import { getPaymentCaptureQueue, getJobState } from "../lib/payment-capture-queue";

async function checkPendingOrders() {
    try {
        const queue = getPaymentCaptureQueue();

        // Get all jobs in the queue
        const [waiting, active, delayed, completed, failed] = await Promise.all([
            queue.getWaiting(),
            queue.getActive(),
            queue.getDelayed(),
            queue.getCompleted(),
            queue.getFailed(),
        ]);

        console.log("\n=== Payment Capture Queue Status ===\n");
        console.log(`Waiting:   ${waiting.length} jobs`);
        console.log(`Active:    ${active.length} jobs`);
        console.log(`Delayed:   ${delayed.length} jobs`);
        console.log(`Completed: ${completed.length} jobs (last 100)`);
        console.log(`Failed:    ${failed.length} jobs`);
        console.log("");

        if (waiting.length > 0) {
            console.log("\n--- Waiting Jobs ---");
            for (const job of waiting.slice(0, 10)) {
                console.log(`  ${job.id}: ${JSON.stringify(job.data)}`);
            }
        }

        if (active.length > 0) {
            console.log("\n--- Active Jobs ---");
            for (const job of active) {
                console.log(`  ${job.id}: ${JSON.stringify(job.data)}`);
            }
        }

        if (delayed.length > 0) {
            console.log("\n--- Delayed Jobs ---");
            for (const job of delayed.slice(0, 10)) {
                const delay = job.opts.delay || 0;
                const scheduledTime = new Date(job.timestamp + delay);
                console.log(`  ${job.id}: scheduled for ${scheduledTime.toISOString()}`);
                console.log(`    Data: ${JSON.stringify(job.data)}`);
            }
        }

        if (failed.length > 0) {
            console.log("\n--- Failed Jobs ---");
            for (const job of failed.slice(0, 10)) {
                console.log(`  ${job.id}: ${job.failedReason}`);
                console.log(`    Data: ${JSON.stringify(job.data)}`);
            }
        }

        await queue.close();
        process.exit(0);
    } catch (error) {
        console.error("Error checking queue:", error);
        process.exit(1);
    }
}

checkPendingOrders();
