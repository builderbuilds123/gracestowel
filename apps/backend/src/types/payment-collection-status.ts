/**
 * PAY-01: PaymentCollection Status Types
 * 
 * Type-safe implementation of Medusa v2 PaymentCollection status values.
 * Based on Medusa v2 Payment Module documentation.
 * 
 * Status values:
 * - "not_paid": Initial state, no payment attempted
 * - "awaiting": Payment is being processed
 * - "authorized": Payment authorized but not captured (manual capture mode)
 * - "partially_captured": Partial amount captured
 * - "completed": Full payment captured
 * - "canceled": Payment canceled/voided
 * - "requires_action": Requires additional action (3D Secure, etc.)
 */

/**
 * Valid PaymentCollection status values in Medusa v2
 */
export const PaymentCollectionStatus = {
    NOT_PAID: "not_paid",
    AWAITING: "awaiting",
    AUTHORIZED: "authorized",
    PARTIALLY_CAPTURED: "partially_captured",
    COMPLETED: "completed",
    CANCELED: "canceled",
    REQUIRES_ACTION: "requires_action",
} as const;

/**
 * Type representing valid PaymentCollection status values
 */
export type PaymentCollectionStatusType = typeof PaymentCollectionStatus[keyof typeof PaymentCollectionStatus];

/**
 * Array of all valid status values for runtime validation
 */
export const VALID_PAYMENT_COLLECTION_STATUSES: readonly string[] = Object.values(PaymentCollectionStatus);

/**
 * Statuses that indicate payment has been captured (fully or partially)
 */
export const CAPTURED_STATUSES: readonly PaymentCollectionStatusType[] = [
    PaymentCollectionStatus.COMPLETED,
    PaymentCollectionStatus.PARTIALLY_CAPTURED,
] as const;

/**
 * Statuses that indicate payment is in a terminal/final state
 */
export const TERMINAL_STATUSES: readonly PaymentCollectionStatusType[] = [
    PaymentCollectionStatus.COMPLETED,
    PaymentCollectionStatus.PARTIALLY_CAPTURED,
    PaymentCollectionStatus.CANCELED,
] as const;

/**
 * Statuses that allow cancellation
 */
export const CANCELLABLE_STATUSES: readonly PaymentCollectionStatusType[] = [
    PaymentCollectionStatus.NOT_PAID,
    PaymentCollectionStatus.AWAITING,
    PaymentCollectionStatus.AUTHORIZED,
    PaymentCollectionStatus.REQUIRES_ACTION,
] as const;

/**
 * Validates if a string is a valid PaymentCollection status
 * 
 * @param status - The status value to validate
 * @returns True if status is valid, false otherwise
 */
export function isValidPaymentCollectionStatus(status: unknown): status is PaymentCollectionStatusType {
    return typeof status === "string" && VALID_PAYMENT_COLLECTION_STATUSES.includes(status);
}

/**
 * Validates and normalizes a PaymentCollection status value
 * 
 * @param status - The status value to validate
 * @param orderId - Optional order ID for error messages
 * @returns The validated status
 * @throws Error if status is invalid
 */
export function validatePaymentCollectionStatus(
    status: unknown,
    orderId?: string
): PaymentCollectionStatusType {
    if (!isValidPaymentCollectionStatus(status)) {
        const orderContext = orderId ? ` for order ${orderId}` : "";
        throw new Error(
            `Invalid PaymentCollection status${orderContext}: ${JSON.stringify(status)}. ` +
            `Valid values: ${VALID_PAYMENT_COLLECTION_STATUSES.join(", ")}`
        );
    }
    return status;
}

/**
 * Checks if a status indicates payment has been captured
 * 
 * @param status - The status to check
 * @returns True if status indicates captured payment
 */
export function isCapturedStatus(status: PaymentCollectionStatusType): boolean {
    return CAPTURED_STATUSES.includes(status);
}

/**
 * Checks if a status is in a terminal/final state
 * 
 * @param status - The status to check
 * @returns True if status is terminal
 */
export function isTerminalStatus(status: PaymentCollectionStatusType): boolean {
    return TERMINAL_STATUSES.includes(status);
}

/**
 * Checks if a status allows cancellation
 * 
 * @param status - The status to check
 * @returns True if status allows cancellation
 */
export function isCancellableStatus(status: PaymentCollectionStatusType): boolean {
    return CANCELLABLE_STATUSES.includes(status);
}

