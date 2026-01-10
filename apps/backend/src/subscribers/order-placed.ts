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
import { startPaymentCaptureWorker } from "../workers/payment-capture-worker"

interface OrderPlacedEventData {
  id: string;
  modification_token?: string;
}

export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<OrderPlacedEventData>) {
  // Ensure Stripe worker is running (lazy init if loaders aren't auto-discovered)
  ensureStripeWorkerStarted(container)

  if (process.env.REDIS_URL) {
    startPaymentCaptureWorker(container)
  }

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!data?.id || typeof data.id !== "string") {
    logger.error(`[ORDER_PLACED][CRITICAL] Missing order id in event payload - skipping`)
    console.error("[ORDER_PLACED][CRITICAL] Missing order id in event payload - skipping", data)
    return
  }

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
          "metadata",
          "currency_code",
          "total",
          "customer_id",
          "created_at",
          "items.title",
          "items.quantity",
          "items.unit_price",
          "items.variant.title",
          "items.variant.product.title",
          "payment_collections.payments.data",
          "shipping_address.first_name",
          "shipping_address.last_name",
          "shipping_address.address_1",
          "shipping_address.address_2",
          "shipping_address.city",
          "shipping_address.country_code",
          "shipping_address.postal_code",
          "shipping_address.province",
          "shipping_address.phone",
          "shipping_address.company"
        ],
        filters: { id: data.id },
    })

    if (orders.length > 0) {
        const order = orders[0]
        const isGuest = !order.customer_id
        
        // CUST-02 FIX: Sync Customer Name & Address from Order
        // Guest customers created by Medusa often lack names and addresses. We backfill them here.
        if (order.customer_id && order.shipping_address) {
            try {
                const customerModule = container.resolve("customer");
                
                // Fetch customer with addresses to check for duplicates
                const customer = await customerModule.retrieveCustomer(order.customer_id, {
                    relations: ["addresses"]
                });
                
                // 1. Sync Name & Phone if missing
                const updatePayload: any = {};
                let validationLog = "";

                if (!customer.first_name && order.shipping_address.first_name) {
                   updatePayload.first_name = order.shipping_address.first_name;
                   updatePayload.last_name = order.shipping_address.last_name || "";
                   validationLog += " [Name]";
                }

                if (!customer.phone && order.shipping_address.phone) {
                   updatePayload.phone = order.shipping_address.phone;
                   validationLog += " [Phone]";
                }

                if (Object.keys(updatePayload).length > 0) {
                    logger.info(`[CUSTOMER] Syncing missing data for customer ${order.customer_id}:${validationLog}`);
                    await customerModule.updateCustomers(order.customer_id, updatePayload);
                }

                // 2. Sync Address (Create new if not exists)
                // Detailed logging for debugging
                 logger.info(`[CUSTOMER] Checking addresses for ${order.customer_id}. Found ${customer.addresses?.length || 0} existing.`);

                // Basic duplicate check based on address_1 and postal_code
                const addressExists = customer.addresses?.some(addr => {
                    const match = addr.address_1 === order.shipping_address.address_1 &&
                                  addr.postal_code === order.shipping_address.postal_code;
                    logger.info(`[CUSTOMER] Comparing: Order(${order.shipping_address.address_1}, ${order.shipping_address.postal_code}) vs Existing(${addr.address_1}, ${addr.postal_code}) => Match: ${match}`);
                    return match;
                });

                logger.info(`[CUSTOMER] Address exist check result: ${addressExists ? "EXISTS" : "NEW"}`);

                if (!addressExists) {
                    logger.info(`[CUSTOMER] Saving new address for customer ${order.customer_id}`);
                    const newAddresses = await customerModule.createCustomerAddresses([
                        {
                            customer_id: order.customer_id,
                            first_name: order.shipping_address.first_name,
                            last_name: order.shipping_address.last_name,
                            address_1: order.shipping_address.address_1,
                            address_2: order.shipping_address.address_2,
                            city: order.shipping_address.city,
                            country_code: order.shipping_address.country_code,
                            postal_code: order.shipping_address.postal_code,
                            province: order.shipping_address.province,
                            phone: order.shipping_address.phone,
                            company: order.shipping_address.company,
                            metadata: { source: "guest_checkout_order" }
                        }
                    ]);
                    logger.info(`[CUSTOMER] Successfully created ${newAddresses.length} new addresses.`);
                }

            } catch (custErr) {
                logger.warn(`[CUSTOMER] Failed to sync customer data: ${custErr.message}`);
            }
        }

        // Generate magic link for guests only
        let magicLink: string | null = null
        if (isGuest) {
            try {
                // Get payment_intent_id from order
                const paymentCollection = order.payment_collections?.[0];
                const payment = paymentCollection?.payments?.[0];
                const paymentData = payment?.data as any;

                const paymentIntentIdFromPaymentCollection =
                  typeof paymentData?.id === "string" && paymentData.id.startsWith("pi_")
                    ? paymentData.id
                    : undefined

                const paymentIntentIdFromMetadata =
                  typeof order.metadata?.stripe_payment_intent_id === "string" &&
                  order.metadata.stripe_payment_intent_id.startsWith("pi_")
                    ? order.metadata.stripe_payment_intent_id
                    : undefined

                const paymentIntentId = paymentIntentIdFromPaymentCollection || paymentIntentIdFromMetadata

                if (paymentIntentId) {
                     // Resolve service from container for dependency injection
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
    // Get the payment intent ID from order - check payment collections first, then metadata
    const query = container.resolve("query")
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id", 
        "metadata", 
        "customer_id", 
        "total", 
        "currency_code", 
        "items.product_id", 
        "items.title", 
        "items.quantity", 
        "items.unit_price",
        // CHK-02-B FIX: Include payment collections to find payment_intent_id
        "payment_collections.payments.data"
      ],
      filters: { id: data.id },
    })

    if (orders.length > 0) {
      const order = orders[0]
      
      // CHK-02-B FIX: Look for payment_intent_id in multiple places:
      // 1. Payment collections (preferred - set by Medusa)
      // 2. Order metadata (fallback - set by custom workflows)
      
      // Primary: Get from payment_collections.payments.data.id
      const paymentCollection = order.payment_collections?.[0]
      const payment = paymentCollection?.payments?.[0]
      const paymentData = payment?.data as any
      const paymentIntentIdFromPayment = 
        typeof paymentData?.id === "string" && paymentData.id.startsWith("pi_")
          ? paymentData.id
          : undefined
      
      // Fallback: Get from metadata
      const rawPaymentIntentId = order.metadata?.stripe_payment_intent_id
      const paymentIntentIdFromMetadata = 
        typeof rawPaymentIntentId === "string" && rawPaymentIntentId.startsWith("pi_")
          ? rawPaymentIntentId
          : undefined
      
      // Use payment collection source first (more reliable), then metadata fallback
      const paymentIntentId = paymentIntentIdFromPayment || paymentIntentIdFromMetadata

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
          logger.info(`[PostHog] order_placed event tracked for order ${data.id}`)
        }
      } catch (error) {
        logger.error(`[PostHog] Failed to track order_placed event for order ${data.id}`, error)
      }
    }
  } catch (error) {
    logger.error(`Failed to schedule payment capture for order ${data.id}`, error)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
