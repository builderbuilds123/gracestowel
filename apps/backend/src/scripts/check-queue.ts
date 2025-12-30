import { Queue } from "bullmq";
// import { redisConnection } from "../lib/redis";

const PAYMENT_CAPTURE_QUEUE_NAME = "payment-capture";

async function checkQueue() {
  console.log("Checking Payment Capture Queue...");

  const queue = new Queue(PAYMENT_CAPTURE_QUEUE_NAME, {
    connection: {
        url: process.env.REDIS_URL || "redis://localhost:6379"
    }
  });

  const counts = await queue.getJobCounts();
  console.log("Job Counts:", counts);

  const specificJobId = "capture-order_01KCT8TAZD9TNC6BD53ZFQQSK3";
  const job = await queue.getJob(specificJobId);

  if (job) {
      console.log(`Found job ${specificJobId}:`);
      console.log(`State: ${await job.getState()}`);
      console.log(`Data:`, JSON.stringify(job.data, null, 2));
      const state = await job.getState();
      if (state === "failed") {
          console.log(`Failed Reason: ${job.failedReason}`);
          console.log(`Stacktrace:`, job.stacktrace);
      }
  } else {
      console.log(`Job ${specificJobId} not found.`);
  }

  /*
  const jobs = await queue.getJobs(["waiting", "active", "delayed", "failed", "completed"]);
  
  if (jobs.length === 0) {
    console.log("No jobs found in queue.");
  } else {
    console.log(`Found ${jobs.length} jobs:`);
    for (const job of jobs) {
      // ...
    }
  }
  */

  await queue.close();
  process.exit(0);
}

checkQueue().catch(err => {
    console.error("Error checking queue:", err);
    process.exit(1);
});
