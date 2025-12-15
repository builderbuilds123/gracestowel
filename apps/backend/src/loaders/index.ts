import paymentCaptureWorkerLoader from "./payment-capture-worker"
import stripeEventWorkerLoader from "./stripe-event-worker"
import emailWorkerLoader from "./email-worker"

export default [
  paymentCaptureWorkerLoader,
  stripeEventWorkerLoader,
  emailWorkerLoader,
]
