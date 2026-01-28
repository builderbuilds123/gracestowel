/**
 * Debug script to inspect payment capture delay configuration
 * Run: node apps/backend/debug-payment-capture.js
 */

const { Queue } = require('bullmq');
const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redisUrl = new URL(REDIS_URL);

const connection = {
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port || '6379'),
    password: redisUrl.password || undefined,
    username: redisUrl.username || undefined,
};

async function debugPaymentCapture() {
    console.log('=== Payment Capture Delay Debug ===\n');
    
    // Check environment variable
    console.log('1. Environment Variable Check:');
    console.log(`   PAYMENT_CAPTURE_DELAY_MS: "${process.env.PAYMENT_CAPTURE_DELAY_MS}"`);
    console.log(`   Type: ${typeof process.env.PAYMENT_CAPTURE_DELAY_MS}`);
    if (process.env.PAYMENT_CAPTURE_DELAY_MS) {
        const delayMs = parseInt(process.env.PAYMENT_CAPTURE_DELAY_MS, 10);
        const delaySeconds = delayMs / 1000;
        const delayMinutes = Math.floor(delaySeconds / 60);
        console.log(`   Parsed: ${delayMs}ms = ${delayMinutes} minutes ${Math.round(delaySeconds % 60)} seconds`);
    }
    console.log('');
    
    // Check queue state
    const queue = new Queue('payment-capture', { connection });
    
    console.log('2. Queue State:');
    const delayed = await queue.getDelayed();
    const waiting = await queue.getWaiting();
    const active = await queue.getActive();
    const completed = await queue.getCompleted(0, 4);
    
    console.log(`   Delayed jobs: ${delayed.length}`);
    console.log(`   Waiting jobs: ${waiting.length}`);
    console.log(`   Active jobs: ${active.length}`);
    console.log(`   Recent completed: ${completed.length}`);
    console.log('');
    
    // Inspect delayed jobs
    if (delayed.length > 0) {
        console.log('3. Delayed Jobs (first 3):');
        for (let i = 0; i < Math.min(3, delayed.length); i++) {
            const job = delayed[i];
            const delay = job.opts?.delay || 0;
            const scheduledAt = job.data?.scheduledAt || Date.now();
            const expectedTime = new Date(scheduledAt + delay);
            const now = Date.now();
            const timeUntilExecution = expectedTime.getTime() - now;
            
            console.log(`   Job ${i + 1}:`);
            console.log(`     Order ID: ${job.data?.orderId}`);
            console.log(`     Job ID: ${job.id}`);
            console.log(`     Delay option: ${delay}ms (${Math.round(delay / 1000)}s)`);
            console.log(`     Scheduled at: ${new Date(scheduledAt).toISOString()}`);
            console.log(`     Expected execution: ${expectedTime.toISOString()}`);
            console.log(`     Time until execution: ${Math.round(timeUntilExecution / 1000)}s (${Math.round(timeUntilExecution / 60000)} min)`);
            console.log(`     Source: ${job.data?.source || 'normal'}`);
            console.log('');
        }
    }
    
    // Inspect completed jobs
    if (completed.length > 0) {
        console.log('4. Recent Completed Jobs (last 3):');
        for (let i = 0; i < Math.min(3, completed.length); i++) {
            const job = completed[i];
            const delay = job.opts?.delay || 0;
            const scheduledAt = job.data?.scheduledAt || 0;
            const processedAt = job.processedOn || 0;
            const actualDelay = processedAt - scheduledAt;
            
            console.log(`   Job ${i + 1}:`);
            console.log(`     Order ID: ${job.data?.orderId}`);
            console.log(`     Job ID: ${job.id}`);
            console.log(`     Delay option: ${delay}ms (${Math.round(delay / 1000)}s)`);
            console.log(`     Scheduled at: ${scheduledAt ? new Date(scheduledAt).toISOString() : 'N/A'}`);
            console.log(`     Processed at: ${processedAt ? new Date(processedAt).toISOString() : 'N/A'}`);
            console.log(`     Actual delay: ${actualDelay}ms (${Math.round(actualDelay / 1000)}s = ${Math.round(actualDelay / 60000)} min)`);
            console.log(`     Source: ${job.data?.source || 'normal'}`);
            console.log('');
        }
    }
    
    await queue.close();
    process.exit(0);
}

debugPaymentCapture().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
