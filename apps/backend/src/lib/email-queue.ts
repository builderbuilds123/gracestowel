import { Queue, Job } from "bullmq"

/**
 * Email job payload structure
 */
export interface EmailJobPayload {
  orderId: string
  template: "order_confirmation" // extend for future templates
  recipient: string
  data: {
    orderNumber: string | number
    items: Array<{ title: string; quantity: number; unit_price: number }>
    total: number
    currency: string
    magicLink?: string | null
    isGuest?: boolean
    // extensible for future templates
  }
}

const QUEUE_NAME = "email-queue"

let emailQueue: Queue<EmailJobPayload> | null = null

/**
 * Get Redis connection options from environment
 */
const getRedisConnection = () => {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    throw new Error("REDIS_URL is not configured")
  }

  const url = new URL(redisUrl)
  return {
    host: url.hostname,
    port: parseInt(url.port || "6379"),
    password: url.password || undefined,
    username: url.username || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
  }
}

/**
 * Get the email queue singleton
 */
export function getEmailQueue(): Queue<EmailJobPayload> {
  if (!emailQueue) {
    emailQueue = new Queue<EmailJobPayload>(QUEUE_NAME, {
      connection: getRedisConnection(),
    })
  }
  return emailQueue
}

/**
 * Enqueue an email job
 * @param payload - The email job payload
 * @returns The created job or null if failed
 */
export async function enqueueEmail(payload: EmailJobPayload): Promise<Job<EmailJobPayload> | null> {
  const queue = getEmailQueue()
  const jobId = `email-${payload.orderId}`

  const job = await queue.add(jobId, payload, {
    jobId, // idempotency key
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000, // 1s, 2s, 4s
    },
  })

  return job
}
