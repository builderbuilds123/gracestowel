import { type ActionFunctionArgs, data } from "react-router";
import { toCents, fromCents } from "../lib/price";
import { createLogger, getTraceIdFromRequest } from "../lib/logger";
import { monitoredFetch, type CloudflareEnv } from "../utils/monitored-fetch";

// Common supported currencies (module-level constant)
const COMMON_CURRENCIES = new Set([
  'usd', 'eur', 'gbp', 'cad', 'aud', 'jpy', 'cny', 'inr', 'brl', 'mxn',
  'nzd', 'sgd', 'hkd', 'nok', 'sek', 'dkk', 'pln', 'chf', 'krw', 'thb'
]);

// Safe Stripe error codes to expose to clients (user-actionable errors)
const SAFE_ERROR_CODES = new Set([
  'amount_too_small', 'amount_too_large', 'invalid_currency',
  'parameter_missing', 'parameter_invalid_empty', 'rate_limit'
]);

interface CartItem {
  id: string | number;
  variantId?: string;
  sku?: string;
  title: string;
  price: string;
  quantity: number;
  color?: string;
}

interface ShippingAddress {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  postalCode: string;
  countryCode: string;
  phone?: string;
}

interface PaymentIntentRequest {
  amount: number;
  currency: string;
  shipping?: number;
  cartId: string; // Required for SEC-01: server-side pricing enforcement
  cartItems?: CartItem[];
  customerId?: string;
  customerEmail?: string;
  shippingAddress?: ShippingAddress;
  paymentIntentId?: string; // For reuse/update
}

interface StockValidationResult {
  valid: boolean;
  outOfStockItems: Array<{
    title: string;
    requested: number;
    available: number;
  }>;
}

/**
 * Generate deterministic idempotency key from cart contents
 * Uses FNV-1a hash for better distribution and includes timestamp bucket
 * to allow retries within a time window while preventing rapid duplicates
 * 
 * Note: Stripe caches idempotency keys for 24 hours. To avoid collisions
 * we include a 1-minute time bucket and a random session nonce.
 */
function generateIdempotencyKey(
  amount: number,
  currency: string,
  cartItems: CartItem[] | undefined,
  customerId: string | undefined
): string {
  const cartHash = cartItems
    ? cartItems
        .map((i) => `${i.variantId}:${i.quantity}:${i.price}`)
        .sort()
        .join("|")
    : "empty";
  
  // Include a 1-minute time bucket to allow fresh attempts
  const timeBucket = Math.floor(Date.now() / (60 * 1000));
  
  // Add random nonce to prevent collisions across different sessions
  const nonce = Math.random().toString(36).substring(2, 8);
  
  const raw = `pi_${customerId || "guest"}_${amount}_${currency}_${cartHash}_${timeBucket}_${nonce}`;

  // FNV-1a hash - better distribution than simple hash
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  
  // Convert to base36 and ensure sufficient length
  const hashStr = (hash >>> 0).toString(36).padStart(8, '0');
  return `pi_${hashStr}_${amount}`;
}

/**
 * Validate stock availability for cart items
 * In Medusa v2, we query products by variant ID and use *variants.inventory_quantity field
 */
async function validateStock(
  cartItems: CartItem[],
  medusaBackendUrl: string,
  publishableKey?: string,
  cloudflareEnv?: CloudflareEnv
): Promise<StockValidationResult> {
  const outOfStockItems: StockValidationResult["outOfStockItems"] = [];

  for (const item of cartItems) {
    if (!item.variantId) continue;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (publishableKey) {
        headers["x-publishable-api-key"] = publishableKey;
      }

      // Medusa v2: Use products endpoint with variant filter to get inventory
      const response = await monitoredFetch(
        `${medusaBackendUrl}/store/products?variants.id=${encodeURIComponent(item.variantId)}&fields=*variants.inventory_quantity`,
        { headers, method: "GET", label: "stock-check", cloudflareEnv }
      );

      if (!response.ok) {
        if (response.status === 404) {
          outOfStockItems.push({
            title: item.title,
            requested: item.quantity,
            available: 0,
          });
        }
        continue;
      }

      const data = (await response.json()) as {
        products: Array<{
          variants: Array<{ id: string; inventory_quantity?: number }>;
        }>;
      };
      
      // Find the variant in the product's variants array
      const product = data.products?.[0];
      const variant = product?.variants?.find(v => v.id === item.variantId);

      if (variant) {
        const available = variant.inventory_quantity ?? Infinity;
        if (item.quantity > available) {
          outOfStockItems.push({
            title: item.title,
            requested: item.quantity,
            available: Math.max(0, available),
          });
        }
      } else if (!product) {
        // Product not found - treat as out of stock
        outOfStockItems.push({
          title: item.title,
          requested: item.quantity,
          available: 0,
        });
      }
    } catch (error) {
      // Log error but continue without blocking checkout
      console.error(`Error checking stock for ${item.title}:`, error);
    }
  }

  return {
    valid: outOfStockItems.length === 0,
    outOfStockItems,
  };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const traceId = getTraceIdFromRequest(request);
  const logger = createLogger({ traceId });

  if (request.method !== "POST") {
    logger.warn("Invalid method", { method: request.method });
    return data({ message: "Method not allowed" }, { status: 405 });
  }

  const {
    amount, // Ignored in favor of Medusa Cart (SEC-01)
    currency,
    shipping, // Ignored in favor of Medusa Cart (SEC-01)
    cartItems,
    cartId,
    customerId,
    customerEmail,
    shippingAddress,
    paymentIntentId,
  } = (await request.json()) as PaymentIntentRequest;

  // Access full Cloudflare env to include PostHog config for monitoredFetch
  const env = context.cloudflare.env as {
    STRIPE_SECRET_KEY: string;
    MEDUSA_BACKEND_URL?: string;
    MEDUSA_PUBLISHABLE_KEY?: string;
    VITE_POSTHOG_API_KEY?: string;
    VITE_POSTHOG_HOST?: string;
    POSTHOG_API_KEY?: string;
    POSTHOG_HOST?: string;
    POSTHOG_SERVER_CAPTURE_ENABLED?: string | boolean;
    [key: string]: unknown;
  };
  const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
  const medusaBackendUrl = env.MEDUSA_BACKEND_URL || "http://localhost:9000";
  const publishableKey = env.MEDUSA_PUBLISHABLE_KEY;

  if (!STRIPE_SECRET_KEY) {
    logger.error("STRIPE_SECRET_KEY not set");
    return data({ message: "Payment service not configured", traceId }, { status: 500 });
  }

  if (!publishableKey) {
    logger.error("MEDUSA_PUBLISHABLE_KEY not set");
    return data({ message: "Medusa API key not configured", traceId }, { status: 500 });
  }

  logger.info("PaymentIntent request received", {
    paymentIntentId: paymentIntentId || "new",
    amount,
    currency,
    hasCartItems: !!cartItems?.length,
    isUpdate: !!paymentIntentId,
  });

  try {
    // Validate stock (only on create, skip on update for performance)
    if (!paymentIntentId && cartItems && cartItems.length > 0) {
      logger.info("Validating stock", { itemCount: cartItems.length });
      const stockValidation = await validateStock(
        cartItems,
        medusaBackendUrl,
        publishableKey,
        env
      );
      if (!stockValidation.valid) {
        const itemMessages = stockValidation.outOfStockItems
          .map((item) => `${item.title}: only ${item.available} available`)
          .join(", ");
        logger.warn("Stock validation failed", {
          outOfStockItems: stockValidation.outOfStockItems,
        });
        return data(
          {
            message: `Out of stock: ${itemMessages}`,
            outOfStockItems: stockValidation.outOfStockItems,
            traceId,
          },
          { status: 400 }
        );
      }
    }

    // SEC-01: Fetch authoritative cart data from Medusa
    // MNY-01: Ensure correct unit conversion (Medusa major -> Stripe cents)
    let calculatedAmount = 0;

    if (cartId) {
        // Fetch cart from Medusa
        const cartResponse = await monitoredFetch(`${medusaBackendUrl}/store/carts/${cartId}`, {
            headers: {
                "x-publishable-api-key": publishableKey,
            },
            label: "fetch-medusa-cart",
            cloudflareEnv: env,
        });

        if (!cartResponse.ok) {
            logger.error("Failed to fetch Medusa cart", new Error("Cart not found or error"), { cartId });
            return data({ message: "Invalid cart", traceId }, { status: 400 });
        }

        // Type safe cart interface
        interface MedusaCart {
            id?: string;
            total?: number;
            summary?: {
                current_order_total?: number;
            };
        }

        const { cart } = await cartResponse.json() as { cart: MedusaCart };

        if (cart && (cart.total !== undefined || cart.summary?.current_order_total !== undefined)) {
            // Prefer summary.current_order_total if available (Medusa v2 pattern)
            const cartTotal = cart.summary?.current_order_total ?? cart.total;

            // AI-NOTE: Medusa returns cents (e.g. 5000). Stripe expects cents (5000).
            // Do NOT multiply by 100. Reference: MNY-01 correction.
            calculatedAmount = Number(cartTotal);

            logger.info("Used Medusa cart for pricing", {
                cartId,
                medusaTotal: cartTotal,
                calculatedCents: calculatedAmount,
                clientAmount: amount,
                clientShipping: shipping
            });
        } else {
             logger.error("Medusa cart missing total", new Error("Cart missing total"), { cartId, cart });
             return data({ message: "Invalid cart data", traceId }, { status: 500 });
        }
    } else {
        // SEC-01: Fail if no cartId provided
        logger.error("No cartId provided for payment intent");
        return data({ message: "Cart ID is required", traceId }, { status: 400 });
    }

    const totalAmount = fromCents(calculatedAmount); // Convert back to dollars for local variables if needed
    const isUpdate = !!paymentIntentId;

    // Validate amount is positive
    if (calculatedAmount <= 0) {
      logger.error("Invalid amount", new Error("Amount must be positive"), {
        amount,
        shipping,
        calculatedAmount,
      });
      return data(
        { message: "Invalid amount: must be greater than 0", traceId },
        { status: 400 }
      );
    }

    // Validate currency (normalize to lowercase)
    const validatedCurrency = (currency || "usd").toLowerCase();
    
    // Basic format validation
    if (!validatedCurrency.match(/^[a-z]{3}$/)) {
      logger.error("Invalid currency format", new Error("Currency must be 3 letter code"), {
        currency: validatedCurrency,
      });
      return data(
        { message: "Invalid currency code format (must be 3 lowercase letters)", traceId },
        { status: 400 }
      );
    }
    
    // Warn if using uncommon currency (but allow it - Stripe will validate)
    if (!COMMON_CURRENCIES.has(validatedCurrency)) {
      logger.warn("Uncommon currency code", {
        currency: validatedCurrency,
        message: "Currency not in common list but will be validated by Stripe"
      });
    }

    logger.info("Payment validation passed", {
      calculatedAmountInCents: calculatedAmount,
      currency: validatedCurrency,
    });

    // Build request headers
    const headers: Record<string, string> = {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    // Idempotency key only for CREATE
    if (!isUpdate) {
      headers["Idempotency-Key"] = generateIdempotencyKey(
        fromCents(calculatedAmount),
        validatedCurrency,
        cartItems,
        customerId
      );
    }

    const body = new URLSearchParams();
    body.append("amount", calculatedAmount.toString());

    // These params only on CREATE
    if (!isUpdate) {
      body.append("currency", validatedCurrency);
      body.append("automatic_payment_methods[enabled]", "true");
      body.append("capture_method", "manual");
      body.append(
        "payment_method_options[us_bank_account][financial_connections][permissions][0]",
        "payment_method"
      );
      body.append(
        "payment_method_options[acss_debit][mandate_options][payment_schedule]",
        "sporadic"
      );
      body.append(
        "payment_method_options[acss_debit][mandate_options][transaction_type]",
        "personal"
      );
      body.append(
        "payment_method_options[acss_debit][verification_method]",
        "automatic"
      );
    }

    // Metadata - can be set on create or update
    if (cartId) body.append("metadata[cart_id]", cartId);

    if (cartItems && cartItems.length > 0) {
      body.append(
        "metadata[cart_data]",
        JSON.stringify({
          items: cartItems.map((item) => ({
            variantId: item.variantId,
            sku: item.sku,
            title: item.title,
            price: item.price,
            quantity: item.quantity,
            color: item.color,
          })),
        })
      );
    }
    if (customerId) body.append("metadata[customer_id]", customerId);
    if (customerEmail) {
      body.append("metadata[customer_email]", customerEmail);
      // Also set receipt_email so Stripe receipts and backend fallback work
      body.append("receipt_email", customerEmail);
    }
    if (shippingAddress)
      body.append("metadata[shipping_address]", JSON.stringify(shippingAddress));
    if (shipping) body.append("metadata[shipping_amount]", shipping.toString());
    
    // Add trace ID to metadata for backend correlation
    body.append("metadata[trace_id]", traceId);

    // CREATE or UPDATE
    const url = isUpdate
      ? `https://api.stripe.com/v1/payment_intents/${paymentIntentId}`
      : "https://api.stripe.com/v1/payment_intents";

    // Log request details for debugging
    logger.info("Calling Stripe API", {
      operation: isUpdate ? "update" : "create",
      paymentIntentId,
      amount: totalAmount,
      currency: validatedCurrency,
      amountInCents: toCents(totalAmount),
      hasCartItems: !!cartItems?.length,
      cartItemCount: cartItems?.length,
      idempotencyKey: headers["Idempotency-Key"],
    });

    const response = await monitoredFetch(url, {
      method: "POST",
      headers,
      body: body.toString(),
      label: isUpdate ? "stripe-payment-intent-update" : "stripe-payment-intent-create",
      cloudflareEnv: env,
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // Parse Stripe error response for better diagnostics
      let stripeError: any = null;
      try {
        stripeError = JSON.parse(errorText);
      } catch {
        // Error is not JSON, use raw text
        stripeError = { raw: errorText };
      }
      
      // Enhanced logging with full error details
      logger.error("Stripe API error", new Error(errorText), {
        status: response.status,
        statusText: response.statusText,
        paymentIntentId,
        operation: isUpdate ? "update" : "create",
        stripeErrorType: stripeError?.error?.type,
        stripeErrorCode: stripeError?.error?.code,
        stripeErrorMessage: stripeError?.error?.message,
        stripeErrorParam: stripeError?.error?.param,
        requestAmount: totalAmount,
        requestCurrency: validatedCurrency,
        requestAmountInCents: toCents(totalAmount),
      });
      
      // Sanitize error message to avoid exposing sensitive information
      // Only include user-friendly Stripe error messages for safe, user-actionable errors
      const errorCode = stripeError?.error?.code;
      const errorMessage = stripeError?.error?.message;
      
      // Generic fallback for any unsafe/unknown errors
      const GENERIC_ERROR_MESSAGE = "Payment service error - please try again or contact support";
      
      // Only include detailed message if:
      // 1. errorCode exists and is valid
      // 2. errorCode is in the safe list
      // 3. errorMessage exists and is a non-empty string
      const debugInfo = (errorCode && SAFE_ERROR_CODES.has(errorCode) && errorMessage)
        ? `Stripe error: ${errorMessage}`
        : GENERIC_ERROR_MESSAGE;
      
      // Determine appropriate status code
      // 400 (Bad Request) -> 400
      // 402 (Request Failed) -> 402
      // 401/403 (Auth/Permission) -> 500 (Server configuration error)
      // 429 (Rate Limit) -> 429
      // 5xx (Stripe Down) -> 502 (Bad Gateway)
      let statusCode = 500;
      
      if (response.status === 400 || response.status === 402 || response.status === 429) {
        statusCode = response.status;
      } else if (response.status >= 500) {
        statusCode = 502;
      }

      return data(
        { 
          message: statusCode === 500 ? "Payment system error" : "Payment failed",
          debugInfo,
          stripeErrorCode: errorCode || undefined,
          traceId 
        },
        { status: statusCode }
      );
    }

    const paymentIntent = (await response.json()) as {
      id: string;
      client_secret: string;
    };

    logger.info("PaymentIntent success", {
      paymentIntentId: paymentIntent.id,
      operation: isUpdate ? "updated" : "created",
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      traceId,
    };
  } catch (error: unknown) {
    logger.error("PaymentIntent failed", error as Error, { paymentIntentId });
    return data({ message: "Payment error", traceId }, { status: 500 });
  }
}
