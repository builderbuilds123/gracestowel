/**
 * Supplementary Charge Workflow
 *
 * Creates a separate PaymentCollection and processes an off-session charge
 * for orders that required additional payment (e.g., items added during modification window
 * on Stripe accounts without IC+ pricing).
 *
 * Uses Medusa's native payment workflows:
 * 1. Creates NEW PaymentCollection linked to order
 * 2. Creates PaymentSession with off-session Stripe data
 * 3. Authorizes and captures immediately
 */

import {
    createStep,
    createWorkflow,
    StepResponse,
    WorkflowResponse,
    transform,
} from "@medusajs/framework/workflows-sdk";
import {
    createPaymentSessionsWorkflow,
    authorizePaymentSessionStep,
    capturePaymentStep,
} from "@medusajs/core-flows";
import { Modules } from "@medusajs/framework/utils";

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
                    amount: input.amount,
                    currency_code: input.currencyCode.toLowerCase(),
                    region_id: input.regionId,
                    metadata: {
                        supplementary_charge: true,
                        source_order_id: input.orderId,
                        created_at: new Date().toISOString(),
                    },
                },
            ]);

        if (!paymentCollection?.id) {
            throw new Error("Failed to create supplementary PaymentCollection");
        }

        stepLogger.info(
            `[supplementary-charge] Created PaymentCollection ${paymentCollection.id} ` +
                `for order ${input.orderId} (amount: ${input.amount} ${input.currencyCode})`
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
            // Compensation: delete the PaymentCollection if workflow fails
            paymentCollection.id
        );
    },
    // Compensation handler
    async (paymentCollectionId, { container }) => {
        if (!paymentCollectionId) return;

        const stepLogger = container.resolve("logger");
        stepLogger.warn(
            `[supplementary-charge] Rolling back: deleting PaymentCollection ${paymentCollectionId}`
        );

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
        } catch (error) {
            stepLogger.error(
                `[supplementary-charge] Failed to rollback PaymentCollection ${paymentCollectionId}`,
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
 * Supplementary Charge Workflow
 *
 * Processes an off-session charge for additional order amounts using:
 * 1. A NEW PaymentCollection (separate from the original)
 * 2. The customer's saved payment method from the original checkout
 * 3. Immediate capture (no authorization hold)
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

        // Step 2: Create off-session payment session using Medusa's native workflow
        // This will create a Stripe PaymentIntent with:
        // - payment_method: the saved payment method
        // - off_session: true (no customer interaction)
        // - confirm: true (immediately confirm)
        // - capture_method: automatic (capture on confirmation)
        //
        // Note: createPaymentSessionsWorkflow fetches amount and currency_code
        // from the PaymentCollection internally, so we don't need to pass them here.
        // The `data` object contains Stripe-specific off-session payment fields.
        const paymentSessionInput = transform(
            { paymentCollectionResult, input },
            (data) => ({
                payment_collection_id: data.paymentCollectionResult.paymentCollectionId,
                provider_id: "pp_stripe_stripe",
                customer_id: data.input.customerId,
                data: {
                    // Stripe-specific fields for off-session payment
                    payment_method: data.input.stripePaymentMethodId,
                    off_session: true,
                    confirm: true,
                    capture_method: "automatic",
                },
            })
        );

        const paymentSession = createPaymentSessionsWorkflow.runAsStep({
            input: paymentSessionInput,
        });

        // Step 3: Authorize the payment session
        // This triggers Stripe to confirm the PaymentIntent
        // The context from paymentSession contains provider-specific data
        const authorizeInput = transform({ paymentSession }, (data) => ({
            id: data.paymentSession.id,
            context: data.paymentSession.context || {},
        }));

        const payment = authorizePaymentSessionStep(authorizeInput);

        // Step 4: Capture the payment
        // With capture_method: "automatic", the payment is already captured by Stripe
        // but this step ensures the Payment record status is updated in Medusa
        const captureInput = transform({ payment }, (data) => {
            if (!data.payment) {
                throw new Error("Payment authorization failed - no payment returned");
            }
            return {
                payment_id: data.payment.id,
                amount: data.payment.amount,
            };
        });

        capturePaymentStep(captureInput);

        // Step 5: Create OrderTransaction record
        // Note: payment.amount is in Medusa's format (major units), not cents
        const transactionInput = transform(
            { input, paymentCollectionResult, payment },
            (data) => {
                if (!data.payment) {
                    throw new Error("Payment not available for transaction creation");
                }
                return {
                    orderId: data.input.orderId,
                    amount: data.input.amount, // Keep in cents for consistency with input
                    currencyCode: data.input.currencyCode,
                    paymentCollectionId: data.paymentCollectionResult.paymentCollectionId,
                    paymentId: data.payment.id,
                };
            }
        );

        createSupplementaryTransactionStep(transactionInput);

        // Return result
        const result = transform(
            { paymentCollectionResult, paymentSession, payment },
            (data) => {
                if (!data.payment) {
                    throw new Error("Payment not available for result");
                }
                return {
                    paymentCollectionId: data.paymentCollectionResult.paymentCollectionId,
                    paymentSessionId: data.paymentSession.id,
                    paymentId: data.payment.id,
                    success: true,
                };
            }
        );

        return new WorkflowResponse(result);
    }
);

export default supplementaryChargeWorkflow;
