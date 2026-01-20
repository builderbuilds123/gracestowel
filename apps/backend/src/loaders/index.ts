import paymentCaptureWorkerLoader from "./payment-capture-worker"
import stripeEventWorkerLoader from "./stripe-event-worker"
import emailQueueLoader from "./email-queue-loader"
import emailWorkerLoader from "./email-worker"
import analyticsLoggerLoader from "./analytics-logger"

export default [
  analyticsLoggerLoader,
  paymentCaptureWorkerLoader,
  stripeEventWorkerLoader,
  emailQueueLoader,
  emailWorkerLoader,
]
