import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
// import { sendOrderConfirmationWorkflow } from "../workflows/send-order-confirmation" // DEPRECATED - Replaced by BullMQ
import { schedulePaymentCapture, formatModificationWindow, PAYMENT_CAPTURE_DELAY_MS } from "../lib/payment-capture-queue"
import { trackEvent } from "../utils/analytics"
import { enqueueEmail } from "../lib/email-queue"
import { Templates } from "../modules/resend/service"
import type { ModificationTokenService } from "../services/modification-token"
import { ensureStripeWorkerStarted } from "../loaders/stripe-event-worker"
import { startPaymentCaptureWorker } from "../workers/payment-capture-worker"
import { startEmailWorker } from "../workers/email-worker"
import { sendAdminNotification, AdminNotificationType } from "../lib/admin-notifications"
import { logger } from "../utils/logger"

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

  // Ensure Email worker is running (lazy init)
  // This fixes the issue where emails queue up but don't send because loader ignored
  if (process.env.REDIS_URL) {
    startEmailWorker(container)
  }

  if (process.env.REDIS_URL) {
    startPaymentCaptureWorker(container)
  }

  // const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  if (!data?.id || typeof data.id !== "string") {
    logger.error("order-placed", "Missing order id in event payload - skipping", { data })
    return
  }

  logger.info("order-placed", "Order placed event received", { order_id: data.id })

  // Log masked token for audit trail (Story 4.1 requirement) - logged BEFORE email attempt
  if (data.modification_token) {
    logger.info("order-placed", "Token received (masked)", { token_masked: `****...${data.modification_token.slice(-8)}` })
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
          "subtotal",
          "shipping_total",
          "tax_total",
          "customer_id",
          "created_at",
          // In Medusa V2: order.items seems to be hydrated as OrderLineItem[] directly if fields are requested
          "items.*", // FIXED: Fetch all item fields to ensure quantity/unit_price are present
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
        
        // DEBUG: Log first item to verify field mapping
        if (order.items && order.items.length > 0) {
             logger.debug("order-placed", "First Item debug", { first_item: order.items[0], order_id: order.id })
        } else {
             logger.warn("order-placed", "No items found on order", { order_id: order.id })
        }

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
                interface CustomerUpdatePayload {
                    first_name?: string;
                    last_name?: string;
                    phone?: string;
                }
                const updatePayload: CustomerUpdatePayload = {};
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
                    logger.info("customer-sync", `Syncing missing data for customer: ${validationLog}`, { customer_id: order.customer_id });
                    await customerModule.updateCustomers(order.customer_id, updatePayload);
                }

                // 2. Sync Address (Create new if not exists)
                // Detailed logging for debugging (sanitized)
                 logger.info("customer-sync", "Checking addresses", { customer_id: order.customer_id, count: customer.addresses?.length || 0 });

                // Basic duplicate check based on address_1 and postal_code
                const addressExists = customer.addresses?.some(addr => {
                    const sa = order.shipping_address;
                    if (!sa) return false;
                    const match = addr.address_1 === sa.address_1 &&
                                  addr.postal_code === sa.postal_code;
                    // SEC-02: Do not log PII (address_1, postal_code) in plaintext
                    return match;
                });

                logger.info("customer-sync", "Address exist check result", { exists: addressExists });

                const sa = order.shipping_address;
                if (!addressExists && sa.address_1 && sa.postal_code) {
                    logger.info("customer-sync", "Saving new address for customer", { customer_id: order.customer_id });
                    const newAddresses = await customerModule.createCustomerAddresses([
                        {
                            customer_id: order.customer_id,
                            first_name: sa.first_name,
                            last_name: sa.last_name,
                            address_1: sa.address_1,
                            address_2: sa.address_2,
                            city: sa.city,
                            country_code: sa.country_code,
                            postal_code: sa.postal_code,
                            province: sa.province,
                            phone: sa.phone,
                            company: sa.company,
                            metadata: { source: "guest_checkout_order" }
                        }
                    ]);
                    logger.info("customer-sync", "Successfully created new addresses", { count: newAddresses.length });
                }

            } catch (custErr: any) {
                logger.error("customer-sync", "Failed to sync customer data", { order_id: order.id }, custErr);
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
                        logger.warn("email-magic-link", "STOREFRONT_URL not set - using localhost default for magic link");
                      }
                      const baseUrl = storefrontUrl || "http://localhost:5173";
                      magicLink = `${baseUrl}/order/status/${order.id}?token=${token}`;

                      logger.info("email-magic-link", "Magic link generated for guest order", { order_id: order.id });
                } else {
                    logger.warn("email-magic-link", "Could not find payment intent ID - magic link skipped", { order_id: order.id });
                }
            } catch (error: any) {
                // Log warning but continue - email will be sent without magic link
                // Sanitize error message to avoid PII leak
                const safeErrorMessage = error.message ? error.message.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***') : 'Unknown error';
                logger.warn("email-magic-link", "Failed to generate magic link", { order_id: order.id, error: safeErrorMessage });
            }
        }

        // Prepare email payload matching OrderPlacedEmailProps interface
        // Template must be "order-placed" to match Templates.ORDER_PLACED enum
        // Note: Medusa v2 stores prices in MAJOR currency units (e.g., $34.00 not 3400 cents)
        const emailPayload = {
            entityId: order.id,
            template: Templates.ORDER_PLACED,
            recipient: order.email || "",
            data: {
              order: {
                id: order.id,
                display_id: order.display_id || undefined,
                email: order.email || undefined,
                currency_code: order.currency_code,
                total: order.total,
                subtotal: order.subtotal,
                shipping_total: order.shipping_total,
                tax_total: order.tax_total,
                // In Medusa V2: order.items has direct access to line item properties
                // Handle both flat structure (Medusa V2) and nested structure (test mocks)
                items: (order.items || []).map((orderItem: any) => {
                  const lineItem = orderItem.item || orderItem;
                  return {
                    title: lineItem.product_title || lineItem.title || orderItem.product_title || orderItem.title || 'Unknown Product',
                    variant_title: lineItem.variant_title || orderItem.variant_title,
                    color: lineItem.metadata?.color || lineItem.metadata?.cart_data?.color || orderItem.metadata?.color || orderItem.metadata?.cart_data?.color,
                    quantity: Number(orderItem.quantity) || 1,
                    unit_price: Number(orderItem.unit_price) || Number(lineItem.unit_price) || 0,
                  };
                }),
                shipping_address: order.shipping_address ? {
                  first_name: order.shipping_address.first_name ?? undefined,
                  last_name: order.shipping_address.last_name ?? undefined,
                  address_1: order.shipping_address.address_1 ?? undefined,
                  address_2: order.shipping_address.address_2 ?? undefined,
                  city: order.shipping_address.city ?? undefined,
                  province: order.shipping_address.province ?? undefined,
                  postal_code: order.shipping_address.postal_code ?? undefined,
                  country_code: order.shipping_address.country_code ?? undefined,
                } : undefined,
              },
              modification_token: magicLink ? magicLink.split('token=')[1] : undefined,
            },
        }

        // Skip if no email address
        if (!emailPayload.recipient) {
            logger.warn("email-queue", "No email address for order - skipping", { order_id: order.id })
        } else {
            // Enqueue email (non-blocking)
            const result = await enqueueEmail(emailPayload)
            if (result) {
                logger.info("email-queue", "Order confirmation queued", { order_id: order.id })
            } else {
                logger.warn("email-queue", "Failed to queue order confirmation", { order_id: order.id })
            }
        }
    } else {
        logger.error("email-queue", "Order not found for email", { order_id: data.id })
    }
  } catch (error: any) {
    // Log but don't throw - email failure shouldn't block order
    logger.error("email-queue", "Failed to queue confirmation", { order_id: data.id }, error)
  }

  // Send admin notification for new order
  try {
    await sendAdminNotification(container, {
      type: AdminNotificationType.ORDER_PLACED,
      title: "New Order Received",
      description: `Order ${data.id} has been placed`,
      metadata: { order_id: data.id },
    })

  } catch (error: unknown) {
    // const message = error instanceof Error ? error.message : String(error)
    logger.error("admin-notification", "Failed to send admin notification", { order_id: data.id }, error as Error)
  }

  // Schedule payment capture after modification window
  try {
    // DEBUG: Log capture scheduling attempt
    logger.info("payment-capture", "[DEBUG] Starting payment capture scheduling", {
      order_id: data.id,
      timestamp: new Date().toISOString()
    })

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
          // DEBUG: Log detailed scheduling info
          logger.info("payment-capture", "[DEBUG] About to schedule payment capture", {
            order_id: data.id,
            pi: paymentIntentId,
            delay_ms: PAYMENT_CAPTURE_DELAY_MS,
            delay_seconds: PAYMENT_CAPTURE_DELAY_MS / 1000,
            delay_minutes: Math.round(PAYMENT_CAPTURE_DELAY_MS / 60000),
            scheduled_capture_time: new Date(Date.now() + PAYMENT_CAPTURE_DELAY_MS).toISOString(),
            current_time: new Date().toISOString()
          })

          logger.info("payment-capture", "Attempting to schedule payment capture", { order_id: data.id, pi: paymentIntentId })
          await schedulePaymentCapture(data.id, paymentIntentId)
          logger.info("payment-capture", "Payment capture scheduled", { order_id: data.id, delay: formatModificationWindow(), pi: paymentIntentId })
        } catch (scheduleError: any) {
          // Story 6.2: Handle Redis connection failures gracefully
          const isRedisError = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(scheduleError?.code)
          
          if (isRedisError) {
            logger.error("payment-capture", "Redis connection failed - flagging for recovery", { order_id: data.id }, scheduleError)
            
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
            logger.info("payment-recovery", "Order flagged for recovery due to Redis failure", { order_id: data.id })
          } else {
            // Re-throw non-Redis errors
            throw scheduleError
          }
        }
      } else {
        // M1: Log as error/warn indicating data integrity issue
        logger.error("payment-capture", "No payment intent ID found - Automatic capture will NOT happen", { order_id: data.id })
      }

      // Track order.placed event in analytics
      try {
        await trackEvent(container, "order.placed", {
          actorId: order.customer_id || undefined,
          properties: {
            order_id: order.id,
            total: order.total,
            currency: order.currency_code,
            item_count: order.items?.length || 0,
            items: order.items?.map((item: any) => ({
              product_id: item.product_id,
              quantity: item.quantity,
              unit_price: item.unit_price,
            })) || [],
          },
        })

        logger.info("analytics", "order.placed event tracked", { order_id: data.id })
      } catch (error: any) {
        logger.error("analytics", "Failed to track order.placed event", { order_id: data.id }, error)
      }
    }
  } catch (error: any) {
    logger.error("payment-capture", "Failed to schedule payment capture", { order_id: data.id }, error)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
