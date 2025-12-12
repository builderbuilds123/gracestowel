import paymentCaptureWorkerLoader from "./payment-capture-worker"
import stripeEventWorkerLoader from "./stripe-event-worker"

export default [
  paymentCaptureWorkerLoader,
  stripeEventWorkerLoader,
]
