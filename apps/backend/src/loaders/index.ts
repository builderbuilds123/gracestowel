import paymentCaptureWorkerLoader from "./payment-capture-worker"
import stripeEventWorkerLoader from "./stripe-event-worker"
import emailQueueLoader from "./email-queue-loader"
import emailWorkerLoader from "./email-worker"

export default [
  paymentCaptureWorkerLoader,
  stripeEventWorkerLoader,
  emailQueueLoader,
  emailWorkerLoader,
]
