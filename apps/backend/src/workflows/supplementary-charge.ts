/**
 * Supplementary Charge Workflow
 *
 * Creates a separate PaymentCollection and processes an off-session charge
 * for orders that required additional payment (e.g., items added during modification window
 * on Stripe accounts without IC+ pricing).
 *
 * IMPORTANT: For off-session payments, Stripe requires a Customer with an attached PaymentMethod.
 * This workflow handles guest customers by:
 * 1. Creating/finding a Stripe Customer
 * 2. Attaching the PaymentMethod to the customer
 * 3. Creating a PaymentSession via Payment Module Service (with proper context)
 * 4. Authorizing the payment via authorizePaymentSessionStep (creates Payment record)
 *
 * The payment is authorized (not captured) and will be captured at fulfillment time
 * by the capturePaymentWorkflow in payment-capture-core.ts.
 */

import {
    createStep,
    createWorkflow,
    StepResponse,
    WorkflowResponse,
    transform,
} from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import {
    authorizePaymentSessionStep,
} from "@medusajs/medusa/core-flows";
import { getStripeClient } from "../utils/stripe";

/**
 * Input for the supplementary charge workflow
 */
export interface SupplementaryChargeInput {
    /** The order ID to charge */
    orderId: string;
    /** Amount to charge in cents */
    amount: number;
    /** Currency code (e.g., "usd") */
    currencyCode: string;
    /** Stripe PaymentMethod ID from the original PaymentIntent */
    stripePaymentMethodId: string;
    /** Optional Medusa customer ID */
    customerId?: string;
    /** Region ID for the payment collection */
    regionId?: string;
    /** Customer email for Stripe Customer lookup/creation */
    customerEmail?: string;
}

/**
 * Handler: Create a PaymentCollection for the supplementary charge
 * and link it to the order.
 * Exported for unit testing.
 */
export async function createSupplementaryPCHandler(
    input: {
        orderId: string;
        amount: number;
        currencyCode: string;
        regionId?: string;
    },
    { container }: { container: MedusaContainer }
) {
    const stepLogger = container.resolve("logger");

    // Validate input
    if (!input.amount || input.amount <= 0) {
        throw new Error(`Invalid supplementary amount: ${input.amount}`);
    }

    // Convert from cents to major units for Medusa
    // Input amount is in cents (for Stripe compatibility), but Medusa v2 uses major units
    const amountInMajorUnits = input.amount / 100;

    // Create PaymentCollection using Payment Module
    interface PaymentModuleService {
        createPaymentCollections: (
            collections: Array<{
                amount: number;
                currency_code: string;
                region_id?: string;
                metadata?: Record<string, unknown>;
            }>
        ) => Promise<Array<{ id: string; status?: string }>>;
    }
    const paymentModuleService = container.resolve(
        Modules.PAYMENT
    ) as PaymentModuleService;

    const [paymentCollection] =
        await paymentModuleService.createPaymentCollections([
            {
                amount: amountInMajorUnits,
                currency_code: input.currencyCode.toLowerCase(),
                region_id: input.regionId,
                metadata: {
                    supplementary_charge: true,
                    source_order_id: input.orderId,
                    amount_in_cents: input.amount, // Store original cents for reference
                    created_at: new Date().toISOString(),
                },
            },
        ]);

    if (!paymentCollection?.id) {
        throw new Error("Failed to create supplementary PaymentCollection");
    }

    stepLogger.info(
        `[supplementary-charge] Created PaymentCollection ${paymentCollection.id} ` +
            `for order ${input.orderId} (amount: ${amountInMajorUnits} ${input.currencyCode}, ${input.amount} cents)`
    );

    // Link PaymentCollection to Order using remoteLink
    interface RemoteLinkService {
        create: (links: {
            [key: string]: {
                [idKey: string]: string;
            };
        }) => Promise<unknown[]>;
    }
    const remoteLink = container.resolve("remoteLink") as unknown as RemoteLinkService;

    await remoteLink.create({
        [Modules.ORDER]: {
            order_id: input.orderId,
        },
        [Modules.PAYMENT]: {
            payment_collection_id: paymentCollection.id,
        },
    });

    stepLogger.info(
        `[supplementary-charge] Linked PaymentCollection ${paymentCollection.id} to order ${input.orderId}`
    );

    return {
        paymentCollectionId: paymentCollection.id,
    };
}

const createSupplementaryPaymentCollectionStep = createStep(
    "create-supplementary-payment-collection",
    async (
        input: {
            orderId: string;
            amount: number;
            currencyCode: string;
            regionId?: string;
        },
        { container }
    ) => {
        const result = await createSupplementaryPCHandler(input, { container });
        return new StepResponse(
            result,
            {
                paymentCollectionId: result.paymentCollectionId,
                orderId: input.orderId,
            }
        );
    },
    // Compensation handler - deletes BOTH the PaymentCollection AND the link to prevent orphaned links
    async (compensationData, { container }) => {
        if (!compensationData?.paymentCollectionId) return;

        const { paymentCollectionId, orderId } = compensationData;
        const stepLogger = container.resolve("logger");

        stepLogger.warn(
            `[supplementary-charge] Rolling back: deleting PaymentCollection ${paymentCollectionId} and its link to order ${orderId}`
        );

        // First, delete the link to prevent orphaned links
        // This MUST happen before deleting the PaymentCollection
        if (orderId) {
            try {
                interface RemoteLinkService {
                    dismiss: (links: {
                        [key: string]: {
                            [idKey: string]: string;
                        };
                    }) => Promise<void>;
                }
                const remoteLink = container.resolve("remoteLink") as unknown as RemoteLinkService;

                await remoteLink.dismiss({
                    [Modules.ORDER]: {
                        order_id: orderId,
                    },
                    [Modules.PAYMENT]: {
                        payment_collection_id: paymentCollectionId,
                    },
                });

                stepLogger.info(
                    `[supplementary-charge] Deleted link between order ${orderId} and PaymentCollection ${paymentCollectionId}`
                );
            } catch (linkError) {
                stepLogger.error(
                    `[supplementary-charge] Failed to delete link for PaymentCollection ${paymentCollectionId}`,
                    linkError
                );
                // Continue to delete the PaymentCollection even if link deletion fails
            }
        }

        // Then delete the PaymentCollection
        try {
            interface PaymentModuleService {
                deletePaymentCollections: (ids: string[]) => Promise<void>;
            }
            const paymentModuleService = container.resolve(
                Modules.PAYMENT
            ) as PaymentModuleService;
            await paymentModuleService.deletePaymentCollections([
                paymentCollectionId,
            ]);

            stepLogger.info(
                `[supplementary-charge] Deleted PaymentCollection ${paymentCollectionId}`
            );
        } catch (error) {
            stepLogger.error(
                `[supplementary-charge] Failed to delete PaymentCollection ${paymentCollectionId}`,
                error
            );
        }
    }
);


/**
 * Step to prepare Stripe Customer for off-session payments
 *
 * This step handles the Stripe-specific setup for off-session payments:
 * 1. Creates/finds a Stripe Customer (required for off-session payments)
 * 2. Attaches the PaymentMethod to the customer
 *
 * The actual PaymentIntent creation is handled by Medusa's native
 * createPaymentSessionsWorkflow with the Stripe provider.
 */
/**
 * Handler: Prepare Stripe Customer for off-session payments.
 * Exported for unit testing.
 */
export async function prepareStripeCustomerHandler(
    input: {
        stripePaymentMethodId: string;
        customerEmail?: string;
        orderId: string;
    },
    { container }: { container: MedusaContainer }
) {
    const stepLogger = container.resolve("logger");
    const stripe = getStripeClient();

    stepLogger.info(
        `[supplementary-charge] Preparing Stripe Customer for order ${input.orderId}, pm: ${input.stripePaymentMethodId}`
    );

    // Step 1: Check if PaymentMethod is already attached to a customer
    // If so, we MUST use that customer (can't attach PM to multiple customers)
    let stripeCustomerId: string;

    const paymentMethod = await stripe.paymentMethods.retrieve(input.stripePaymentMethodId);

    if (paymentMethod.customer) {
        // PaymentMethod already belongs to a customer - use that customer
        stripeCustomerId = typeof paymentMethod.customer === 'string'
            ? paymentMethod.customer
            : paymentMethod.customer.id;
        stepLogger.info(
            `[supplementary-charge] PaymentMethod already attached to Customer ${stripeCustomerId}, reusing`
        );
    } else {
        // PaymentMethod not attached - find or create customer
        if (input.customerEmail) {
            const existingCustomers = await stripe.customers.list({
                email: input.customerEmail,
                limit: 1,
            });

            if (existingCustomers.data.length > 0) {
                stripeCustomerId = existingCustomers.data[0].id;
                stepLogger.info(
                    `[supplementary-charge] Found existing Stripe Customer: ${stripeCustomerId}`
                );
            } else {
                // Create new customer
                const newCustomer = await stripe.customers.create({
                    email: input.customerEmail,
                    metadata: {
                        medusa_order_id: input.orderId,
                        created_for: "supplementary_charge",
                    },
                });
                stripeCustomerId = newCustomer.id;
                stepLogger.info(
                    `[supplementary-charge] Created new Stripe Customer: ${stripeCustomerId}`
                );
            }
        } else {
            // No email - create anonymous customer for this charge
            const newCustomer = await stripe.customers.create({
                metadata: {
                    medusa_order_id: input.orderId,
                    created_for: "supplementary_charge",
                    anonymous: "true",
                },
            });
            stripeCustomerId = newCustomer.id;
            stepLogger.info(
                `[supplementary-charge] Created anonymous Stripe Customer: ${stripeCustomerId}`
            );
        }

        // Attach PaymentMethod to Customer
        // This is required before using the PaymentMethod for off-session payments
        try {
            await stripe.paymentMethods.attach(input.stripePaymentMethodId, {
                customer: stripeCustomerId,
            });
            stepLogger.info(
                `[supplementary-charge] Attached PaymentMethod ${input.stripePaymentMethodId} to Customer ${stripeCustomerId}`
            );
        } catch (attachError: unknown) {
            // PaymentMethod might already be attached to this customer
            const errorMessage = attachError instanceof Error ? attachError.message : String(attachError);
            if (!errorMessage.includes("already been attached")) {
                throw attachError;
            }
            stepLogger.info(
                `[supplementary-charge] PaymentMethod already attached to customer`
            );
        }
    }

    return { stripeCustomerId };
}

const prepareStripeCustomerStep = createStep(
    "prepare-stripe-customer",
    async (
        input: {
            stripePaymentMethodId: string;
            customerEmail?: string;
            orderId: string;
        },
        { container }
    ) => {
        const result = await prepareStripeCustomerHandler(input, { container });
        return new StepResponse(result, result);
    }
);

/**
 * Step to create PaymentSession using Medusa native workflow
 *
 * This step uses createPaymentSessionsWorkflow to create a PaymentSession
 * with the Stripe provider. The Stripe-specific data parameters enable
 * off-session payment with manual capture (authorize-only).
 */
/**
 * Handler: Create PaymentSession using Medusa native service.
 * Exported for unit testing.
 */
export async function createSupplementarySessionHandler(
    input: {
        paymentCollectionId: string;
        stripePaymentMethodId: string;
        stripeCustomerId: string;
        amount: number;
        currencyCode: string;
    },
    { container }: { container: MedusaContainer }
) {
    const stepLogger = container.resolve("logger");

    stepLogger.info(
        `[supplementary-charge] Creating PaymentSession for collection ${input.paymentCollectionId}, amount: ${input.amount} cents`
    );

    // Use Payment Module Service directly to create PaymentSession
    // This bypasses createPaymentSessionsWorkflow which overwrites our context with undefined values
    //
    // IMPORTANT: The Stripe provider extracts customer from context.account_holder.data.id
    // (see stripe-base.ts line 140: intentRequest.customer = context?.account_holder?.data?.id)
    // So we must pass the Stripe Customer ID in the context
    interface PaymentModuleService {
        createPaymentSession: (
            paymentCollectionId: string,
            input: {
                provider_id: string;
                currency_code: string;
                amount: number;
                data: Record<string, unknown>;
                context: Record<string, unknown>;
            }
        ) => Promise<{ id: string }>;
    }
    const paymentModuleService = container.resolve(Modules.PAYMENT) as PaymentModuleService;

    // Convert amount from cents to major units for Medusa
    const amountInMajorUnits = input.amount / 100;

    const paymentSession = await paymentModuleService.createPaymentSession(
        input.paymentCollectionId,
        {
            provider_id: "pp_stripe",  // Match existing provider ID
            currency_code: input.currencyCode,
            amount: amountInMajorUnits,
            data: {
                // Stripe-specific data for off-session payment with manual capture
                payment_method: input.stripePaymentMethodId,
                off_session: true,
                confirm: true,
                capture_method: "manual",  // KEY: Authorize only, don't capture
            },
            context: {
                // The Stripe provider expects the customer ID in account_holder.data.id
                account_holder: {
                    data: {
                        id: input.stripeCustomerId,
                    },
                },
            },
        }
    );

    stepLogger.info(
        `[supplementary-charge] Created PaymentSession ${paymentSession.id} via Payment Module Service`
    );

    return { paymentSessionId: paymentSession.id };
}

const createSupplementaryPaymentSessionStep = createStep(
    "create-supplementary-payment-session",
    async (
        input: {
            paymentCollectionId: string;
            stripePaymentMethodId: string;
            stripeCustomerId: string;
            amount: number;
            currencyCode: string;
        },
        { container }
    ) => {
        const result = await createSupplementarySessionHandler(input, { container });
        return new StepResponse(result, result);
    },
    // Compensation: Delete PaymentSession
    async (compensationData, { container }) => {
        if (!compensationData?.paymentSessionId) return;

        const stepLogger = container.resolve("logger");

        try {
            stepLogger.warn(
                `[supplementary-charge] Rolling back: deleting PaymentSession ${compensationData.paymentSessionId}`
            );

            // Use the payment module service to delete the session
            // The deletePaymentSessions method may not be directly exposed on IPaymentModuleService,
            // but the underlying module supports this operation
            const paymentModuleService = container.resolve(Modules.PAYMENT) as any;
            if (typeof paymentModuleService.deletePaymentSessions === "function") {
                await paymentModuleService.deletePaymentSessions([compensationData.paymentSessionId]);
            }

            stepLogger.info(
                `[supplementary-charge] Deleted PaymentSession ${compensationData.paymentSessionId}`
            );
        } catch (error) {
            stepLogger.error(
                `[supplementary-charge] Failed to delete PaymentSession ${compensationData.paymentSessionId}`,
                error
            );
        }
    }
);


/**
 * Supplementary Charge Workflow
 *
 * Processes an off-session charge for additional order amounts using:
 * 1. A NEW PaymentCollection (separate from the original)
 * 2. Medusa native createPaymentSessionsWorkflow with Stripe provider
 * 3. authorizePaymentSessionStep to create Payment record
 * 4. Deferred capture at fulfillment time (capture_method: "manual")
 *
 * This ensures proper PaymentSession and Payment records are created,
 * and the supplementary payment stays in "authorized" status until fulfillment.
 */
export const supplementaryChargeWorkflow = createWorkflow(
    "supplementary-charge",
    function (input: SupplementaryChargeInput) {
        // Step 1: Create PaymentCollection and link to order
        const paymentCollectionResult = createSupplementaryPaymentCollectionStep(
            {
                orderId: input.orderId,
                amount: input.amount,
                currencyCode: input.currencyCode,
                regionId: input.regionId,
            }
        );

        // Step 2: Prepare Stripe Customer (find/create + attach PaymentMethod)
        const stripeCustomerInput = transform(
            { input },
            (data) => ({
                stripePaymentMethodId: data.input.stripePaymentMethodId,
                customerEmail: data.input.customerEmail,
                orderId: data.input.orderId,
            })
        );

        const stripeCustomerResult = prepareStripeCustomerStep(stripeCustomerInput);

        // Step 3: Create PaymentSession via native workflow
        const paymentSessionInput = transform(
            { paymentCollectionResult, stripeCustomerResult, input },
            (data) => ({
                paymentCollectionId: data.paymentCollectionResult.paymentCollectionId,
                stripePaymentMethodId: data.input.stripePaymentMethodId,
                stripeCustomerId: data.stripeCustomerResult.stripeCustomerId,
                amount: data.input.amount,
                currencyCode: data.input.currencyCode,
            })
        );

        const paymentSessionResult = createSupplementaryPaymentSessionStep(paymentSessionInput);

        // Step 4: Authorize PaymentSession (creates Payment record)
        // This step calls the Stripe provider's authorizePayment() method,
        // creates a Payment record in Medusa, and updates PaymentCollection status to "authorized"
        const authorizeInput = transform(
            { paymentSessionResult },
            (data) => ({
                id: data.paymentSessionResult.paymentSessionId,
                context: {},
            })
        );

        const payment = authorizePaymentSessionStep(authorizeInput);

        // Return result
        const result = transform(
            { paymentCollectionResult, paymentSessionResult, payment, stripeCustomerResult },
            (data) => ({
                paymentCollectionId: data.paymentCollectionResult.paymentCollectionId,
                paymentSessionId: data.paymentSessionResult.paymentSessionId,
                paymentId: data.payment?.id || "",
                stripePaymentIntentId: (data.payment?.data as Record<string, unknown> | undefined)?.id as string | undefined,
                stripeCustomerId: data.stripeCustomerResult.stripeCustomerId,
                status: "authorized",
                success: true,
            })
        );

        return new WorkflowResponse(result);
    }
);

export default supplementaryChargeWorkflow;
