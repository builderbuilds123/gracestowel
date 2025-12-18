import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
// import { sendOrderConfirmationWorkflow } from "../workflows/send-order-confirmation" // DEPRECATED - Replaced by BullMQ
import { schedulePaymentCapture } from "../lib/payment-capture-queue"
import { getPostHog } from "../utils/posthog"
import { enqueueEmail } from "../lib/email-queue"
import type { ModificationTokenService } from "../services/modification-token"
import { ensureStripeWorkerStarted } from "../loaders/stripe-event-worker"
import { Modules } from "@medusajs/framework/utils"

interface OrderPlacedEventData {
  id: string;
  modification_token?: string;
}

// Track if subscribers have been registered (Medusa v2 doesn't auto-discover them)
let subscribersRegistered = false;

async function ensureSubscribersRegistered(container: any) {
  if (subscribersRegistered) return;

  try {
    console.log("[SUBSCRIBERS] Registering project subscribers via order-placed handler...");
    const eventBusModuleService = container.resolve(Modules.EVENT_BUS);

    // Import and register customer-created subscriber
    const customerCreatedModule = await import("./customer-created");
    eventBusModuleService.subscribe(customerCreatedModule.config.event, async (data: any) => {
      await customerCreatedModule.default({ event: { name: customerCreatedModule.config.event, data }, container });
    });
    console.log(`[SUBSCRIBERS] ✅ Registered: ${customerCreatedModule.config.event}`);

    // Import and register fulfillment-created subscriber
    const fulfillmentCreatedModule = await import("./fulfillment-created");
    eventBusModuleService.subscribe(fulfillmentCreatedModule.config.event, async (data: any) => {
      await fulfillmentCreatedModule.default({ event: { name: fulfillmentCreatedModule.config.event, data }, container });
    });
    console.log(`[SUBSCRIBERS] ✅ Registered: ${fulfillmentCreatedModule.config.event}`);

    // Import and register order-canceled subscriber
    const orderCanceledModule = await import("./order-canceled");
    eventBusModuleService.subscribe(orderCanceledModule.config.event, async (data: any) => {
      await orderCanceledModule.default({ event: { name: orderCanceledModule.config.event, data }, container });
    });
    console.log(`[SUBSCRIBERS] ✅ Registered: ${orderCanceledModule.config.event}`);

    subscribersRegistered = true;
    console.log("[SUBSCRIBERS] All subscribers registered successfully");
  } catch (error) {
    console.error("[SUBSCRIBERS] Failed to register subscribers:", error);
  }
}

export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<OrderPlacedEventData>) {
  // Ensure Stripe worker is running (lazy init if loaders aren't auto-discovered)
  ensureStripeWorkerStarted(container)

  // Ensure other subscribers are registered (Medusa v2 workaround)
  await ensureSubscribersRegistered(container)

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  logger.info(`[ORDER_PLACED] 🎯 Order placed event received: ${data.id}`)

  // Log masked token for audit trail (Story 4.1 requirement) - logged BEFORE email attempt
  if (data.modification_token) {
    logger.info(`[ORDER_PLACED] Token received (masked): ****...${data.modification_token.slice(-8)}`)
  }

  // Send order confirmation email via BullMQ
  // Story 3.1: Replace workflow with enqueueEmail()
  // Story 3.2: Generate magic link for guests
  try {
    const query = container.resolve("query")
    const { data: orders } = await query.graph({
        entity: "order",
        fields: [
          "id",
          "display_id",
          "email",
          "currency_code",
          "total",
          "customer_id",
          "created_at",
          "items.title",
          "items.quantity",
          "items.unit_price",
          "items.variant.title",
          "items.variant.product.title",
          "payment_collections.payments.data"
        ],
        filters: { id: data.id },
    })

    if (orders.length > 0) {
        const order = orders[0]
        const isGuest = !order.customer_id

        // Generate magic link for guests only
        let magicLink: string | null = null
        if (isGuest) {
            try {
                // Get payment_intent_id from order
                const paymentCollection = order.payment_collections?.[0];
                const payment = paymentCollection?.payments?.[0];
                const paymentData = payment?.data as any;

                const paymentIntentId = paymentData?.id;

                if (paymentIntentId) {
                     // Resolve service from container instead of importing singleton
                     const modificationTokenService = container.resolve("modificationTokenService") as ModificationTokenService;

                     const token = modificationTokenService.generateToken(
                        order.id,
                        paymentIntentId,
                        new Date(order.created_at)
                      );

                      const storefrontUrl = process.env.STOREFRONT_URL;
                      if (!storefrontUrl) {
                        logger.warn(`[EMAIL][WARN] STOREFRONT_URL not set - using localhost default for magic link`);
                      }
                      const baseUrl = storefrontUrl || "http://localhost:5173";
                      magicLink = `${baseUrl}/order/status/${order.id}?token=${token}`;

                      logger.info(`[EMAIL] Magic link generated for guest order ${order.id}`);
                } else {
                    logger.warn(`[EMAIL][WARN] Could not find payment intent ID for guest order ${order.id} - magic link skipped`);
                }
            } catch (error: any) {
                // Log warning but continue - email will be sent without magic link
                // Sanitize error message to avoid PII leak
                const safeErrorMessage = error.message ? error.message.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***') : 'Unknown error';
                logger.warn(`[EMAIL][WARN] Failed to generate magic link for order ${order.id}: ${safeErrorMessage}`);
            }
        }

        // Prepare email payload matching OrderPlacedEmailProps interface
        // Template must be "order-placed" to match Templates.ORDER_PLACED enum
        const emailPayload = {
            orderId: order.id,
            template: "order-placed" as const,
            recipient: order.email || "",
            data: {
              order: {
                id: order.id,
                display_id: order.display_id || undefined,
                email: order.email || undefined,
                currency_code: order.currency_code,
                total: order.total,
                items: (order.items || []).map((item: any) => ({
                  title: item.variant?.product?.title || item.title,
                  variant_title: item.variant?.title,
                  quantity: item.quantity,
                  unit_price: item.unit_price,
                })),
              },
              modification_token: magicLink ? magicLink.split('token=')[1] : undefined,
            },
        }

        // Skip if no email address
        if (!emailPayload.recipient) {
            logger.warn(`[EMAIL][WARN] No email address for order ${order.id} - skipping`)
        } else {
            // Enqueue email (non-blocking)
            await enqueueEmail(emailPayload)
            logger.info(`[EMAIL][QUEUE] Order confirmation queued for ${order.id}`)
        }
    } else {
        logger.error(`[EMAIL][ERROR] Order ${data.id} not found for email`)
    }
  } catch (error: any) {
    // Log but don't throw - email failure shouldn't block order
    logger.error(`[EMAIL][ERROR] Failed to queue confirmation for order ${data.id}: ${error.message}`)
  }

  // Schedule payment capture after 1-hour modification window
  try {
    // Get the payment intent ID from the order metadata
    const query = container.resolve("query")
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "metadata", "customer_id", "total", "currency_code", "items.product_id", "items.title", "items.quantity", "items.unit_price"],
      filters: { id: data.id },
    })

    if (orders.length > 0) {
      const order = orders[0]
      const rawPaymentIntentId = order.metadata?.stripe_payment_intent_id
      
      // L1: Validate payment intent ID is a non-empty string
      const paymentIntentId = typeof rawPaymentIntentId === "string" && rawPaymentIntentId.startsWith("pi_")
        ? rawPaymentIntentId
        : undefined

      if (paymentIntentId) {
        try {
          logger.info(`[CAPTURE_SCHEDULE] Attempting to schedule payment capture for order ${data.id}, PI: ${paymentIntentId}`)
          await schedulePaymentCapture(data.id, paymentIntentId)
          logger.info(`[CAPTURE_SCHEDULE] ✅ Payment capture scheduled for order ${data.id} (1 hour delay), PI: ${paymentIntentId}`)
        } catch (scheduleError: any) {
          // Story 6.2: Handle Redis connection failures gracefully
          const isRedisError = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(scheduleError?.code)
          
          if (isRedisError) {
            logger.error(`[CRITICAL][DLQ] Redis connection failed for order ${data.id} - flagging for recovery`, scheduleError)
            
            // Update order metadata with recovery flag
            const orderService = container.resolve("order")
            await orderService.updateOrders([{
              id: data.id,
              metadata: {
                ...order.metadata,
                needs_recovery: true,
                recovery_reason: 'redis_failure'
              }
            }])
            logger.info(`[RECOVERY] Order ${data.id} flagged for recovery due to Redis failure`)
          } else {
            // Re-throw non-Redis errors
            throw scheduleError
          }
        }
      } else {
        // M1: Log as error/warn indicating data integrity issue
        logger.error(`[CRITICAL] No payment intent ID found for order ${data.id} - Automatic capture will NOT happen.`)
      }

      // Track order_placed event in PostHog
      try {
        const posthog = getPostHog()
        if (posthog) {
          posthog.capture({
            distinctId: order.customer_id || `guest_${order.id}`,
            event: 'order_placed',
            properties: {
              order_id: order.id,
              total: order.total,
              currency: order.currency_code,
              item_count: order.items?.length || 0,
              items: order.items?.map((item: any) => ({
                product_id: item.product_id,
                title: item.title,
                quantity: item.quantity,
                unit_price: item.unit_price,
              })) || [],
            },
          })
          console.log(`[PostHog] order_placed event tracked for order ${data.id}`)
        }
      } catch (error) {
        console.error('[PostHog] Failed to track order_placed event:', error)
      }
    }
  } catch (error) {
    console.error("Failed to schedule payment capture:", error)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
