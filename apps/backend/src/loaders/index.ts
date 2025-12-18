import paymentCaptureWorkerLoader from "./payment-capture-worker"
import stripeEventWorkerLoader from "./stripe-event-worker"
import emailQueueLoader from "./email-queue-loader"
import emailWorkerLoader from "./email-worker"
import subscriberLoader from "./subscriber-loader"

export default [
  subscriberLoader, // Load subscribers first so they're ready for events
  paymentCaptureWorkerLoader,
  stripeEventWorkerLoader,
  emailQueueLoader,
  emailWorkerLoader,
]
