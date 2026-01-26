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
 * 3. Creating an off-session PaymentIntent directly via Stripe API
 * 4. Recording the payment in Medusa
 */

import {
    createStep,
    createWorkflow,
    StepResponse,
    WorkflowResponse,
    transform,
} from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";
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
 * Step to create a PaymentCollection for the supplementary charge
 * and link it to the order
 */
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

        return new StepResponse(
            {
                paymentCollectionId: paymentCollection.id,
            },
            // Compensation data: include both IDs needed for rollback
            {
                paymentCollectionId: paymentCollection.id,
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
 * Step to add an OrderTransaction for the supplementary charge
 */
const createSupplementaryTransactionStep = createStep(
    "create-supplementary-transaction",
    async (
        input: {
            orderId: string;
            amount: number;
            currencyCode: string;
            paymentCollectionId: string;
            paymentId: string;
        },
        { container }
    ) => {
        const stepLogger = container.resolve("logger");

        try {
            interface OrderModuleService {
                addOrderTransactions: (transaction: {
                    order_id: string;
                    amount: number;
                    currency_code: string;
                    reference: string;
                    reference_id: string;
                }) => Promise<unknown>;
            }
            const orderModuleService = container.resolve(
                Modules.ORDER
            ) as unknown as OrderModuleService;

            // Convert cents to major units for Medusa
            const amountInMajorUnits = input.amount / 100;

            await orderModuleService.addOrderTransactions({
                order_id: input.orderId,
                amount: amountInMajorUnits,
                currency_code: input.currencyCode,
                reference: "supplementary_capture",
                reference_id:
                    input.paymentId ||
                    input.paymentCollectionId ||
                    `supplementary_${input.orderId}`,
            });

            stepLogger.info(
                `[supplementary-charge] Created OrderTransaction for order ${input.orderId} ` +
                    `(amount: ${amountInMajorUnits} ${input.currencyCode})`
            );

            return new StepResponse({ success: true });
        } catch (error) {
            stepLogger.error(
                `[supplementary-charge] Failed to create OrderTransaction for order ${input.orderId}`,
                error
            );
            // Don't throw - transaction record is not critical
            return new StepResponse({ success: false, error: String(error) });
        }
    }
);

/**
 * Step to process off-session Stripe payment
 *
 * This step handles the Stripe-specific logic for off-session payments:
 * 1. Creates/finds a Stripe Customer (required for off-session payments)
 * 2. Attaches the PaymentMethod to the customer
 * 3. Creates a PaymentIntent with off_session: true and captures immediately
 * 4. Returns the PaymentIntent details for recording in Medusa
 */
const processStripeOffSessionPaymentStep = createStep(
    "process-stripe-off-session-payment",
    async (
        input: {
            paymentCollectionId: string;
            orderId: string;
            amount: number;
            currencyCode: string;
            stripePaymentMethodId: string;
            customerEmail?: string;
        },
        { container }
    ) => {
        const stepLogger = container.resolve("logger");
        const stripe = getStripeClient();

        stepLogger.info(
            `[supplementary-charge] Processing Stripe off-session payment for order ${input.orderId}`,
            { amount: input.amount, currency: input.currencyCode, paymentMethod: input.stripePaymentMethodId }
        );

        // Step 1: Get or create a Stripe Customer
        // For off-session payments, Stripe requires the PaymentMethod to be attached to a Customer
        let stripeCustomerId: string;

        // Try to find existing customer by email if provided
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

        // Step 2: Attach PaymentMethod to Customer
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

        // Step 3: Create and confirm PaymentIntent with off_session
        const paymentIntent = await stripe.paymentIntents.create({
            amount: input.amount, // Already in cents
            currency: input.currencyCode.toLowerCase(),
            customer: stripeCustomerId,
            payment_method: input.stripePaymentMethodId,
            off_session: true,
            confirm: true,
            capture_method: "automatic",
            metadata: {
                medusa_order_id: input.orderId,
                medusa_payment_collection_id: input.paymentCollectionId,
                supplementary_charge: "true",
            },
        });

        stepLogger.info(
            `[supplementary-charge] Created PaymentIntent ${paymentIntent.id} with status: ${paymentIntent.status}`,
            {
                amount: paymentIntent.amount,
                currency: paymentIntent.currency,
                capturedAmount: paymentIntent.amount_received
            }
        );

        // Verify payment was successful
        if (paymentIntent.status !== "succeeded") {
            throw new Error(
                `PaymentIntent ${paymentIntent.id} not successful. Status: ${paymentIntent.status}`
            );
        }

        return new StepResponse(
            {
                stripePaymentIntentId: paymentIntent.id,
                stripeCustomerId,
                amount: paymentIntent.amount,
                amountReceived: paymentIntent.amount_received,
                status: paymentIntent.status,
            },
            // Compensation data
            {
                stripePaymentIntentId: paymentIntent.id,
                stripeCustomerId,
            }
        );
    },
    // Compensation: Refund the PaymentIntent if workflow fails
    async (compensationData, { container }) => {
        if (!compensationData?.stripePaymentIntentId) return;

        const stepLogger = container.resolve("logger");
        const stripe = getStripeClient();

        try {
            stepLogger.warn(
                `[supplementary-charge] Rolling back: refunding PaymentIntent ${compensationData.stripePaymentIntentId}`
            );
            await stripe.refunds.create({
                payment_intent: compensationData.stripePaymentIntentId,
            });
            stepLogger.info(
                `[supplementary-charge] Refunded PaymentIntent ${compensationData.stripePaymentIntentId}`
            );
        } catch (error) {
            stepLogger.error(
                `[supplementary-charge] Failed to refund PaymentIntent ${compensationData.stripePaymentIntentId}`,
                error
            );
        }
    }
);

/**
 * Step to record the Stripe payment in Medusa's Payment module
 */
const recordSupplementaryPaymentStep = createStep(
    "record-supplementary-payment",
    async (
        input: {
            paymentCollectionId: string;
            stripePaymentIntentId: string;
            amount: number;
            currencyCode: string;
        },
        { container }
    ) => {
        const stepLogger = container.resolve("logger");

        // Create a PaymentSession record in Medusa to track this payment
        interface PaymentModuleService {
            createPaymentSession: (
                paymentCollectionId: string,
                input: {
                    provider_id: string;
                    amount: number;
                    currency_code: string;
                    data?: Record<string, unknown>;
                }
            ) => Promise<{ id: string; data?: Record<string, unknown> }>;
            updatePaymentSession: (
                input: {
                    id: string;
                    data?: Record<string, unknown>;
                }
            ) => Promise<{ id: string }>;
        }
        const paymentModuleService = container.resolve(
            Modules.PAYMENT
        ) as PaymentModuleService;

        // Convert cents to major units for Medusa
        const amountInMajorUnits = input.amount / 100;

        // Create session (which will create a new PI in Stripe normally, but we'll update it)
        // Actually, we already have a captured PI, so we just need to record it
        const paymentSession = await paymentModuleService.createPaymentSession(
            input.paymentCollectionId,
            {
                provider_id: "pp_stripe",
                amount: amountInMajorUnits,
                currency_code: input.currencyCode.toLowerCase(),
                data: {
                    id: input.stripePaymentIntentId,
                    status: "succeeded",
                    amount: input.amount,
                    currency: input.currencyCode.toLowerCase(),
                },
            }
        );

        stepLogger.info(
            `[supplementary-charge] Recorded PaymentSession ${paymentSession.id} for PaymentIntent ${input.stripePaymentIntentId}`
        );

        return new StepResponse({
            paymentSessionId: paymentSession.id,
        });
    }
);

/**
 * Supplementary Charge Workflow
 *
 * Processes an off-session charge for additional order amounts using:
 * 1. A NEW PaymentCollection (separate from the original)
 * 2. Direct Stripe API for off-session payment (handles Customer creation)
 * 3. Immediate capture
 */
export const supplementaryChargeWorkflow = createWorkflow(
    "supplementary-charge",
    (input: SupplementaryChargeInput) => {
        // Step 1: Create PaymentCollection and link to order
        const paymentCollectionResult = createSupplementaryPaymentCollectionStep(
            {
                orderId: input.orderId,
                amount: input.amount,
                currencyCode: input.currencyCode,
                regionId: input.regionId,
            }
        );

        // Step 2: Prepare input for Stripe off-session payment
        // We need the customer email to find/create a Stripe Customer for off-session payments
        const stripePaymentInput = transform(
            { paymentCollectionResult, input },
            (data) => ({
                paymentCollectionId: data.paymentCollectionResult.paymentCollectionId,
                orderId: data.input.orderId,
                amount: data.input.amount,
                currencyCode: data.input.currencyCode,
                stripePaymentMethodId: data.input.stripePaymentMethodId,
                customerEmail: data.input.customerEmail,
            })
        );

        // Step 3: Process Stripe off-session payment directly
        const stripePaymentResult = processStripeOffSessionPaymentStep(stripePaymentInput);

        // Step 4: Record the payment in Medusa
        const recordInput = transform(
            { paymentCollectionResult, stripePaymentResult, input },
            (data) => ({
                paymentCollectionId: data.paymentCollectionResult.paymentCollectionId,
                stripePaymentIntentId: data.stripePaymentResult.stripePaymentIntentId,
                amount: data.input.amount,
                currencyCode: data.input.currencyCode,
            })
        );

        const recordResult = recordSupplementaryPaymentStep(recordInput);

        // Step 5: Create OrderTransaction record
        const transactionInput = transform(
            { input, paymentCollectionResult, recordResult },
            (data) => ({
                orderId: data.input.orderId,
                amount: data.input.amount,
                currencyCode: data.input.currencyCode,
                paymentCollectionId: data.paymentCollectionResult.paymentCollectionId,
                paymentId: data.recordResult.paymentSessionId,
            })
        );

        createSupplementaryTransactionStep(transactionInput);

        // Return result
        const result = transform(
            { paymentCollectionResult, stripePaymentResult, recordResult },
            (data) => ({
                paymentCollectionId: data.paymentCollectionResult.paymentCollectionId,
                paymentSessionId: data.recordResult.paymentSessionId,
                stripePaymentIntentId: data.stripePaymentResult.stripePaymentIntentId,
                stripeCustomerId: data.stripePaymentResult.stripeCustomerId,
                success: true,
            })
        );

        return new WorkflowResponse(result);
    }
);

export default supplementaryChargeWorkflow;
