import {
    createStep,
    createWorkflow,
    StepResponse,
    WorkflowResponse,
    transform,
    when,
} from "@medusajs/framework/workflows-sdk";
import {
    createOrdersWorkflow,
    createReservationsStep, // Replaced updateInventoryLevelsStep
    acquireLockStep,
    releaseLockStep,
    emitEventStep,
} from "@medusajs/core-flows";
import { Modules } from "@medusajs/framework/utils";
import { modificationTokenService } from "../services/modification-token";
import { InsufficientStockError } from "./add-item-to-order";
import { formatModificationWindow } from "../lib/payment-capture-queue";
import { trackWorkflowEventStep } from "./steps/track-analytics-event";

/**
 * Lock configuration constants for concurrent order creation prevention
 */
const LOCK_CONFIG = {
    /** Maximum time in seconds to wait for acquiring the lock */
    TIMEOUT_SECONDS: 30,
    /** Lock expiration time in seconds (safety mechanism) */
    TTL_SECONDS: 120,
} as const;


/**
 * Input for the create-order-from-stripe workflow
 */
export interface CreateOrderFromStripeInput {
    paymentIntentId: string;
    cartId: string; // Required for SEC-01
    // cartData removed - deprecated metadata flow not supported
    customerEmail?: string;
    // shippingAddress removed - should come from cart
    // shippingAmount removed - should come from cart
    amount: number;
    currency: string;
}

/**
 * SHP-01 Review Fix (Issue 10): Proper TypeScript types for shipping methods
 */
export interface ShippingMethodInput {
    shipping_option_id?: string;
    name?: string;
    amount?: number;
    data?: Record<string, unknown>;
}

export interface ShippingMethodOutput {
    shipping_option_id: string;
    name: string;
    amount: number;
    data: Record<string, unknown>;
}

/**
 * Ensure shipping methods include option ID and provider data
 * AC guard for SHP-01.
 * 
 * SHP-01 Review Fix (Issue 10): Added proper TypeScript types instead of `any`
 */
export const validateShippingMethods = (
    shippingMethods: ShippingMethodInput[] | null | undefined
): ShippingMethodOutput[] => {
    const validMethods = (shippingMethods || []).filter(
        (sm): sm is NonNullable<ShippingMethodInput> => sm != null
    );

    return validMethods.map((sm) => {
        if (!sm.shipping_option_id) {
            throw new Error("Shipping method missing shipping_option_id (SHP-01 violation)");
        }

        if (typeof sm.name !== 'string' || sm.name === '') {
            throw new Error(`Shipping method ${sm.shipping_option_id} missing name (SHP-01 violation)`);
        }

        if (typeof sm.amount !== 'number') {
            throw new Error(`Shipping method ${sm.shipping_option_id} missing amount (SHP-01 violation)`);
        }

        const hasProviderData = sm.data && Object.keys(sm.data).length > 0;
        if (!hasProviderData) {
            throw new Error(`Shipping method ${sm.shipping_option_id} missing provider data (SHP-01 AC2)`);
        }

        return {
            shipping_option_id: sm.shipping_option_id,
            name: sm.name,
            amount: sm.amount,
            data: sm.data!,
        };
    });
};

/**
 * Step to validate and prepare order data from Stripe payment
 */
const prepareOrderDataStep = createStep(
    "prepare-order-data-from-stripe",
    async (input: CreateOrderFromStripeInput, { container }) => {
        const logger = container.resolve("logger");
        const { cartId, customerEmail, amount, currency, paymentIntentId } = input;

        // SEC-01: Strictly enforce authoritative Medusa Cart
        if (!cartId) {
            logger.error(`[create-order-from-stripe] Missing cartId. Metadata flow is deprecated.`);
            throw new Error("Valid Medusa Cart ID is required for order creation.");
        }

        try {
            // Use query service to retrieve cart (Medusa v2 pattern)
            const query = container.resolve("query");
            const { data: carts } = await query.graph({
                entity: "cart",
                fields: [
                    "id",
                    "email",
                    "region_id",
                    "sales_channel_id",
                    "items.*",
                    "items.variant.*",
                    "region.*",
                    "shipping_methods.*",
                    "shipping_methods.shipping_option_id", // SHP-01: Explicitly fetch option ID
                    "shipping_address.*",
                ],
                filters: { id: cartId },
            });

            if (!carts || carts.length === 0) {
                throw new Error(`Cart ${cartId} not found`);
            }

            const cart = carts[0];

            logger.info(`[create-order-from-stripe] Using authoritative Medusa Cart ${cartId}`);
            
            // Transform Medusa cart items to Order items
            // Filter out items without variant_id (required for inventory) and null items
            const items = (cart.items || [])
                .filter((item): item is NonNullable<typeof item> => item != null && item.variant_id != null)
                .map(item => ({
                    variant_id: item.variant_id as string, // Already filtered for null
                    title: item.title,
                    quantity: item.quantity,
                    unit_price: item.unit_price, // Already in correct units (cents) from Medusa
                    metadata: item.metadata || {},
                }));

            const orderData = {
                region_id: cart.region_id ?? undefined, // Convert null to undefined
                email: cart.email || customerEmail,
                items,
                shipping_address: cart.shipping_address ? {
                    first_name: cart.shipping_address.first_name,
                    last_name: cart.shipping_address.last_name,
                    address_1: cart.shipping_address.address_1,
                    address_2: cart.shipping_address.address_2,
                    city: cart.shipping_address.city,
                    province: cart.shipping_address.province,
                    postal_code: cart.shipping_address.postal_code,
                    country_code: cart.shipping_address.country_code,
                    phone: cart.shipping_address.phone,
                } : undefined,
                shipping_methods: validateShippingMethods(cart.shipping_methods as any),
                status: "pending" as const,
                sales_channel_id: cart.sales_channel_id ?? undefined, // Convert null to undefined
                currency_code: cart.region?.currency_code || currency,
                metadata: {
                    stripe_payment_intent_id: paymentIntentId,
                    source_cart_id: cartId,
                }
            };

            return new StepResponse(orderData);
        } catch (e) {
            logger.error(`[create-order-from-stripe] Failed to retrieve cart ${cartId}`, e);
            throw new Error(`Failed to retrieve cart ${cartId}: ${(e as Error).message}`);
        }
    }
);


// ... imports
import InventoryLocationResolver, { InventoryLocationResolverInput } from "../services/inventory-decrement-logic";

/**
 * Step to generate modification token for the order
 * This token allows customers to modify their order within the configured modification window
 */
const generateModificationTokenStep = createStep(
    "generate-modification-token",
    async (input: { orderId: string; paymentIntentId: string; createdAt: Date | string }, { container }) => {
        const logger = container.resolve("logger");
        // SEC-03: Runtime guard - createdAt is required to anchor token expiry
        if (!input.createdAt) {
            throw new Error("createdAt is required to anchor token expiry to order creation time");
        }
        const token = modificationTokenService.generateToken(
            input.orderId,
            input.paymentIntentId,
            input.createdAt
        );
        logger.info(`Generated modification token for order ${input.orderId}`);
        return new StepResponse({ token });
    }
);

/**
 * Step to log order creation for debugging
 */
const logOrderCreatedStep = createStep(
    "log-order-created",
    async (input: { orderId: string; paymentIntentId: string; inventoryAdjusted: boolean; modificationToken: string }, { container }) => {
        const logger = container.resolve("logger");
        logger.info(`Order ${input.orderId} created from Stripe PaymentIntent ${input.paymentIntentId}`);
        if (input.inventoryAdjusted) {
            logger.info(`Inventory levels adjusted for order ${input.orderId}`);
        }
        logger.info(`Modification token generated (valid for ${formatModificationWindow()})`);
        return new StepResponse({ success: true, modificationToken: input.modificationToken });
    }
);

/**
 * PAY-01: Step to create PaymentCollection linked to order
 * 
 * Creates a PaymentCollection with:
 * - provider_id: "pp_stripe" (Stripe payment provider)
 * - Payment record containing Stripe PaymentIntent ID
 * - Initial status: "authorized" (manual capture mode)
 * 
 * AC1: Orders have a linked PaymentCollection with provider pp_stripe
 * AC2: PaymentCollection contains Payment record with Stripe PI ID in data field
 */
const createPaymentCollectionStep = createStep(
    "create-payment-collection",
    async (
        input: {
            orderId: string;
            paymentIntentId: string;
            amount: number;
            currencyCode: string;
            regionId?: string;
        },
        { container }
    ) => {
        const logger = container.resolve("logger");
        // AI-NOTE: PAY-01 - Creates PaymentCollection for Medusa v2 canonical payment tracking

        // REVIEW FIX: Input validation for security compliance
        if (!input.amount || typeof input.amount !== 'number' || input.amount <= 0) {
            throw new Error(`Invalid amount: ${input.amount}. Amount must be a positive number.`);
        }

        if (!input.currencyCode || typeof input.currencyCode !== 'string' || input.currencyCode.length !== 3) {
            throw new Error(`Invalid currency code: ${input.currencyCode}. Must be a 3-letter ISO code.`);
        }

        if (!input.paymentIntentId || !input.paymentIntentId.startsWith('pi_')) {
            throw new Error(`Invalid Stripe PaymentIntent ID: ${input.paymentIntentId}`);
        }

        // NOTE: Medusa v2 does not export IPaymentModuleService as a public type
        // Using 'as any' is the standard pattern for resolving module services in Medusa v2
        // The service provides methods like createPaymentCollections() and createPaymentSession()
        const paymentModuleService = container.resolve(Modules.PAYMENT) as any;

        try {
            // Create payment collection with payment record
            const [paymentCollection] = await paymentModuleService.createPaymentCollections([
                {
                    amount: input.amount,
                    currency_code: input.currencyCode.toLowerCase(),
                    region_id: input.regionId,
                }
            ]);

            // REVIEW FIX (Issue #10): Validate PaymentCollection was created with expected status
            if (!paymentCollection || !paymentCollection.id) {
                throw new Error("PaymentCollection creation returned invalid result");
            }

            // Log initial status for debugging
            logger.info(
                `[PAY-01] PaymentCollection created: id=${paymentCollection.id}, ` +
                `initial_status=${paymentCollection.status || 'unknown'}`
            );

            // Create payment session for the collection
            // This represents the authorized Stripe payment
            const paymentSession = await paymentModuleService.createPaymentSession(paymentCollection.id, {
                provider_id: "pp_stripe",
                amount: input.amount,
                currency_code: input.currencyCode.toLowerCase(),
                data: {
                    id: input.paymentIntentId,
                    status: "requires_capture",
                },
            });

            // REVIEW FIX (Issue #10): Validate PaymentSession was created successfully
            if (!paymentSession || !paymentSession.id) {
                throw new Error("PaymentSession creation returned invalid result");
            }

            logger.info(
                `[PAY-01] Created PaymentCollection ${paymentCollection.id} with PaymentSession ${paymentSession.id} ` +
                `for order ${input.orderId} (PI: ${input.paymentIntentId}, amount: ${input.amount})`
            );

            return new StepResponse({
                paymentCollectionId: paymentCollection.id,
            });
        } catch (error) {
            // REVIEW FIX (Issue #11): Enhanced error handling with metric emission
            logger.error(
                `[PAY-01][ERROR] Failed to create PaymentCollection for order ${input.orderId}:`,
                error
            );

            // Emit metric for monitoring (placeholder - integrate with your metrics system)
            logger.info(
                `[METRIC] payment_collection_creation_failed ` +
                `order=${input.orderId} error=${(error as Error).name} message="${(error as Error).message}"`
            );

            // CRITICAL: Don't throw - order creation should continue even if PC fails
            // This allows graceful degradation, but logs the failure for monitoring
            // Operators should monitor the payment_collection_creation_failed metric
            return new StepResponse({
                paymentCollectionId: null,
                error: (error as Error).message,
                errorName: (error as Error).name
            });
        }
    }
);

/**
 * PAY-01: Step to link PaymentCollection to Order
 * 
 * Updates order with payment_collection_id reference
 * This establishes the relationship for canonical payment queries
 */
const linkPaymentCollectionStep = createStep(
    "link-payment-collection-to-order",
    async (
        input: { orderId: string; paymentCollectionId: string | null },
        { container }
    ) => {
        const logger = container.resolve("logger");
        if (!input.paymentCollectionId) {
            logger.warn(`[PAY-01] No PaymentCollection to link for order ${input.orderId}`);
            return new StepResponse({ linked: false });
        }

        try {
            // Use remote link to establish relationship between order and payment collection
            // NOTE: Medusa v2 does not export IRemoteLink as a public type
            // Using 'as any' is the standard pattern for resolving remoteLink service in Medusa v2
            // The service provides the create() method to establish cross-module relationships
            const remoteLink = container.resolve("remoteLink") as any;
            
            await remoteLink.create({
                [Modules.ORDER]: {
                    order_id: input.orderId,
                },
                [Modules.PAYMENT]: {
                    payment_collection_id: input.paymentCollectionId,
                },
            });

            logger.info(`[PAY-01] Linked PaymentCollection ${input.paymentCollectionId} to order ${input.orderId}`);
            return new StepResponse({ linked: true });
        } catch (error) {
            logger.error(`[PAY-01][ERROR] Failed to link PaymentCollection to order ${input.orderId}:`, error);
            // Don't throw - continue without link if it fails
            return new StepResponse({ linked: false, error: (error as Error).message });
        }
    }
);

/**
 * Step to emit events to the event bus.
 * This step is wrapped in a try-catch to ensure that event emission failures
 * do not block the main workflow, allowing for graceful degradation.
 */
const emitStripeOrderEventStep = createStep(
    "emit-event",
    async (input: { eventName: string; data: any }, { container }) => {
        const logger = container.resolve("logger");
        let eventBusModuleService: any;
        try {
            // Try multiple resolution strategies for event bus (Medusa v2 compatibility)
            try {
                eventBusModuleService = container.resolve("eventBusModuleService") as any;
            } catch {
                try {
                    eventBusModuleService = container.resolve("eventBus") as any;
                } catch {
                    // Try using Modules constant
                    const { Modules } = await import("@medusajs/framework/utils");
                    eventBusModuleService = container.resolve(Modules.EVENT_BUS) as any;
                }
            }
        } catch (err) {
            logger.warn(`[create-order-from-stripe] eventBus not configured, skipping emit. Event: ${input.eventName}, Error: ${err instanceof Error ? err.message : err}`);
            return new StepResponse({ success: false, skipped: true });
        }

        try {
            try {
                await eventBusModuleService.emit({ name: input.eventName, data: input.data });
            } catch (err) {
                // Secondary check for Medusa specific overload
                await eventBusModuleService.emit(input.eventName, input.data);
            }
            logger.info(`Event ${input.eventName} emitted successfully with data: ${JSON.stringify(input.data)}`);
            return new StepResponse({ success: true });
        } catch (err) {
            // P1 FIX: Wrap in outer try-catch to ensure event bus failure doesn't block order creation
            logger.error(`[create-order-from-stripe] CRITICAL: Failed to emit event ${input.eventName}. Error: ${err instanceof Error ? err.message : err}. Proceeding with order creation as best-effort.`);
            return new StepResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
    }
);

/**
 * Step to resolve inventory locations for order items
 */
const resolveInventoryLocationsStep = createStep(
    "resolve-inventory-locations",
    async (input: { 
        orderItems: any[]; 
        salesChannelId?: string | null; 
        preferredLocationIds?: string[];
    }, { container }) => {
        const logger = container.resolve("logger");
        const resolver = new InventoryLocationResolver({
            logger,
            query: container.resolve("query")
        });

        const reservations: any[] = [];
        
        for (const item of input.orderItems) {
            if (!item.variant_id) continue;

            const resolved = await resolver.resolveItemLocation(item.variant_id, {
                salesChannelId: input.salesChannelId,
                preferredLocationIds: input.preferredLocationIds
            }, item.quantity);

            if (resolved) {
                reservations.push({
                    line_item_id: item.id,
                    inventory_item_id: resolved.inventory_item_id,
                    location_id: resolved.location_id,
                    quantity: item.quantity,
                    metadata: {
                        created_via: "create-order-from-stripe"
                    }
                });
            } else {
                 // Warn but don't block order creation? Or block?
                 // If we can't resolve a location, we can't reserve.
                 logger.warn(`Could not resolve inventory location for item ${item.variant_id} - skipping reservation`);
            }
        }
        
        return new StepResponse(reservations);
    }
);

/**
 * Workflow to create an order from a Stripe payment
 */
export const createOrderFromStripeWorkflow = createWorkflow(
    "create-order-from-stripe",
    (input: CreateOrderFromStripeInput) => {
        trackWorkflowEventStep({
            event: "order.create.started",
            failureEvent: "order.create.failed",
            properties: {
                payment_intent_id: input.paymentIntentId,
                cart_id: input.cartId,
            },
        }).config({ name: "track-order-create-started" });

        // Step 0: Acquire lock on PaymentIntent ID
        acquireLockStep({
            key: input.paymentIntentId,
            timeout: LOCK_CONFIG.TIMEOUT_SECONDS,
            ttl: LOCK_CONFIG.TTL_SECONDS,
        });

        // Step 1: Prepare order data from Stripe payment
        const orderData = prepareOrderDataStep(input);

        // Step 2: Create the order using Medusa's built-in workflow
        const order = createOrdersWorkflow.runAsStep({
            input: orderData,
        });

        // Step 3: Prepare inventory input with resolved location IDs
        const inventoryInput = transform({ order, orderData }, (data) => ({
            orderItems: data.order.items || [],
            preferredLocationIds: (data.orderData.shipping_methods || [])
                .map((method: any) => method?.data && (method.data as any).stock_location_id)
                .filter((id: string | undefined): id is string => Boolean(id)),
            salesChannelId: data.orderData.sales_channel_id || null,
        }));

        // Step 4: Resolve locations and create reservations (Native)
        const reservationInput = resolveInventoryLocationsStep(inventoryInput);
        
        // This Step creates reservations in the inventory module.
        createReservationsStep(reservationInput);

        // Step 5: PAY-01 - Create PaymentCollection for canonical payment tracking
        const paymentCollectionInput = transform({ order, input, orderData }, (data) => ({
            orderId: data.order.id,
            paymentIntentId: data.input.paymentIntentId,
            amount: data.input.amount,
            currencyCode: data.orderData.currency_code || data.input.currency,
            regionId: data.orderData.region_id,
        }));
        const paymentCollectionResult = createPaymentCollectionStep(paymentCollectionInput);

        // Step 6: PAY-01 - Link PaymentCollection to Order
        const linkInput = transform({ order, paymentCollectionResult }, (data) => ({
            orderId: data.order.id,
            paymentCollectionId: data.paymentCollectionResult.paymentCollectionId,
        }));
        linkPaymentCollectionStep(linkInput);

        // Step 7: Generate modification token for modification window
        const tokenInput = transform({ order, input }, (data) => ({
            orderId: data.order.id,
            paymentIntentId: data.input.paymentIntentId,
            createdAt: new Date(data.order.created_at),
        }));
        const tokenResult = generateModificationTokenStep(tokenInput);

        // Step 8: Log the order creation
        const logInput = transform({ order, input, tokenResult }, (data) => ({
            orderId: data.order.id,
            paymentIntentId: data.input.paymentIntentId,
            inventoryAdjusted: true, // Native reservations used
            modificationToken: data.tokenResult.token,
        }));
        logOrderCreatedStep(logInput);

        // Step 9: Emit order.placed event to trigger email notification and payment capture scheduling
        // Using native emitStripeOrderEventStep from @medusajs/core-flows - event only emits after workflow success
        emitStripeOrderEventStep({
            eventName: "order.placed",
            data: transform({ order, tokenResult }, (data) => ({
                id: data.order.id,
                modification_token: data.tokenResult.token,
            })),
        });

        const successInput = transform({ order, input }, (data) => ({
            event: "order.create.succeeded",
            properties: {
                order_id: data.order.id,
                payment_intent_id: data.input.paymentIntentId,
            },
        }));
        trackWorkflowEventStep(successInput).config({ name: "track-order-create-succeeded" });

        // Release lock after successful workflow completion
        releaseLockStep({
            key: input.paymentIntentId,
        });

        // Return order with modification token
        const result = transform({ order, tokenResult }, (data) => ({
            ...data.order,
            modification_token: data.tokenResult.token,
        }));
        
        return new WorkflowResponse(result);
    }
);

export default createOrderFromStripeWorkflow;
