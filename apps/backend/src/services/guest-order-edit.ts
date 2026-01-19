
import { MedusaRequest } from "@medusajs/framework/http";
import { 
    createOrderChangeWorkflow,
    requestOrderEditRequestWorkflow,
    confirmOrderEditRequestWorkflow,
    orderEditAddNewItemWorkflow,
    removeItemOrderEditActionWorkflow,
    orderEditUpdateItemQuantityWorkflow,
    updateOrderEditItemQuantityWorkflow,
    createPaymentSessionsWorkflow
} from "@medusajs/core-flows";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { modificationTokenService } from "./modification-token";
import { logger } from "../utils/logger";
import { isCapturedStatus, isValidPaymentCollectionStatus } from "../types/payment-collection-status";

type ValidationResult = {
    valid: boolean;
    error?: string;
    code?: string;
    payload?: any;
    orderId?: string;
};

class GuestOrderEditService {
    private logAudit(action: string, data: Record<string, unknown>, error?: Error) {
        if (error) {
            logger.error("order-edit-audit", `${action} failed`, { ...data, action, outcome: "failure" }, error);
            return;
        }
        logger.info("order-edit-audit", `${action} success`, { ...data, action, outcome: "success" });
    }
    
    validateRequest(req: MedusaRequest, orderIdParam: string): ValidationResult {
        const token = (req.query.token as string) || (req.headers["x-modification-token"] as string);
        
        if (!token) {
            return { valid: false, error: "Modification token is required", code: "TOKEN_REQUIRED" };
        }

        const validation = modificationTokenService.validateToken(token);
        
        if (!validation.valid) {
            return { 
                valid: false, 
                error: validation.error, 
                code: validation.expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID" 
            };
        }

        if (validation.payload?.order_id !== orderIdParam) {
            return { valid: false, error: "Token does not match this order", code: "TOKEN_MISMATCH" };
        }

        return { valid: true, payload: validation.payload, orderId: orderIdParam };
    }

    async getOrCreateActiveOrderEdit(container: any, orderId: string, userId: string) {
        const query = container.resolve(ContainerRegistrationKeys.QUERY);
        
        // Find existing EDIT change
        const { data: existingEdits } = await query.graph({
            entity: "order_change",
            fields: ["id", "status"],
            filters: {
                order_id: orderId,
                change_type: "edit",
                status: ["created", "requested"],
            },
        });

        if (existingEdits.length > 0) {
            const edit = existingEdits[existingEdits.length - 1];
            this.logAudit("order_edit_init", { orderId, userId, orderEditId: edit.id, source: "existing" });
            return edit;
        }

        // Create new Order Change (Edit)
        try {
            const { result } = await createOrderChangeWorkflow(container).run({
                input: {
                    order_id: orderId,
                    change_type: "edit",
                    created_by: userId || "guest_user",
                    description: "Guest Order Modification", 
                },
            });
            this.logAudit("order_edit_init", { orderId, userId, orderEditId: result.id, source: "created" });
            return result;
        } catch (error) {
            const safeError = error instanceof Error ? error : new Error(String(error));
            this.logAudit("order_edit_init", { orderId, userId, source: "create_failed" }, safeError);
            throw error;
        }
    }

    async addItem(container: any, orderId: string, variantId: string, quantity: number, userId = "guest") {
        // Input: { order_id: string (PARENT ORDER ID), items: Array<{ variant_id, quantity }> }
        try {
            const { result } = await orderEditAddNewItemWorkflow(container).run({
                input: {
                    order_id: orderId, 
                    items: [{
                        variant_id: variantId,
                        quantity: quantity,
                    }]
                }
            });
            this.logAudit("order_edit_add_item", { orderId, userId, variantId, quantity });
            return result;
        } catch (error) {
            const safeError = error instanceof Error ? error : new Error(String(error));
            this.logAudit("order_edit_add_item", { orderId, userId, variantId, quantity }, safeError);
            throw error;
        }
    }

    async removeItem(container: any, orderId: string, actionId: string, userId = "guest") {
        // removeItemOrderEditActionWorkflow expects { order_id, action_id }
        try {
            const { result } = await removeItemOrderEditActionWorkflow(container).run({
                input: {
                    order_id: orderId,
                    action_id: actionId,
                }
            });
            this.logAudit("order_edit_remove_item", { orderId, userId, actionId });
            return result;
        } catch (error) {
            const safeError = error instanceof Error ? error : new Error(String(error));
            this.logAudit("order_edit_remove_item", { orderId, userId, actionId }, safeError);
            throw error;
        }
    }

    async updateItemQuantity(container: any, orderId: string, itemIdOrActionId: string, quantity: number, userId = "guest") {
        // Determine if it's an action or a line item
        if (itemIdOrActionId.startsWith("orchact_")) {
            // It's an action (item added during edit)
            try {
                const { result } = await updateOrderEditItemQuantityWorkflow(container).run({
                    input: {
                        order_id: orderId,
                        action_id: itemIdOrActionId,
                        data: { quantity }
                    }
                });
                this.logAudit("order_edit_update_item_quantity", { orderId, userId, actionId: itemIdOrActionId, quantity, source: "action" });
                return result;
            } catch (error) {
                const safeError = error instanceof Error ? error : new Error(String(error));
                this.logAudit("order_edit_update_item_quantity", { orderId, userId, actionId: itemIdOrActionId, quantity, source: "action" }, safeError);
                throw error;
            }
        } else {
            // It's an original line item
            try {
                const { result } = await orderEditUpdateItemQuantityWorkflow(container).run({
                    input: {
                        order_id: orderId,
                        items: [{
                            id: itemIdOrActionId,
                            quantity
                        }]
                    }
                });
                this.logAudit("order_edit_update_item_quantity", { orderId, userId, itemId: itemIdOrActionId, quantity, source: "item" });
                return result;
            } catch (error) {
                const safeError = error instanceof Error ? error : new Error(String(error));
                this.logAudit("order_edit_update_item_quantity", { orderId, userId, itemId: itemIdOrActionId, quantity, source: "item" }, safeError);
                throw error;
            }
        }
    }
    
    async completeEdit(container: any, orderEditId: string, userId: string) {
        // Retrieve Edit to get Parent Order ID
        const query = container.resolve(ContainerRegistrationKeys.QUERY);
        
        const { data: edits } = await query.graph({
            entity: "order_change",
            fields: ["id", "order.id", "payment_collection_id"],
            filters: { id: orderEditId }
        });
        
        if (!edits.length) {
            throw new Error(`Order Edit not found: ${orderEditId}`);
        }
        
        const edit = edits[0];
        const parentOrderId = edit.order?.id;
        
        if (!parentOrderId) {
            throw new Error(`Parent Order ID is NULL for edit ${orderEditId}`);
        }

        // 1. Request Confirmation
        try {
            await requestOrderEditRequestWorkflow(container).run({
                input: {
                    order_id: parentOrderId,
                }
            });
        } catch (e: any) {
            // Log but don't expose
            const safeError = e instanceof Error ? e : new Error(String(e));
            logger.error("order-edit-confirm", "requestOrderEditRequestWorkflow failed", { orderId: parentOrderId, orderEditId: orderEditId }, safeError);
            this.logAudit("order_edit_confirm", { orderId: parentOrderId, orderEditId, userId }, safeError);
            throw e;
        }

        // 2. Check if payment is required (fetch collection separately)
        let differenceDue = 0;
        let paymentCollection: any = null;
        
        if (edit.payment_collection_id) {
            const { data: collections } = await query.graph({
                entity: "payment_collection",
                fields: ["id", "amount", "status"],
                filters: { id: edit.payment_collection_id }
            });
            if (collections.length) {
                paymentCollection = collections[0];
                differenceDue = paymentCollection.amount;
            }
        }
        
        const paymentStatus = paymentCollection?.status;
        const isPaid = isValidPaymentCollectionStatus(paymentStatus) && isCapturedStatus(paymentStatus);

        if (differenceDue > 0 && !isPaid && paymentCollection) {
            // Check if Stripe session already exists
            const { data: fullCollection } = await query.graph({
                entity: "payment_collection",
                fields: ["id", "amount", "currency_code", "payment_sessions.*"],
                filters: { id: edit.payment_collection_id }
            });

            const stripeSession = fullCollection[0]?.payment_sessions?.find((ps: any) => ps.provider_id === "pp_stripe");
            
            let paymentSession = stripeSession;

            if (!stripeSession) {
                // Create Stripe Session
                const { result: newSession } = await createPaymentSessionsWorkflow(container).run({
                    input: {
                        payment_collection_id: edit.payment_collection_id,
                        provider_id: "pp_stripe"
                    }
                });
                paymentSession = newSession;
            }

            this.logAudit("order_edit_confirm", {
                orderId: parentOrderId,
                orderEditId,
                userId,
                status: "payment_required",
                paymentCollectionId: edit.payment_collection_id,
            });
            return {
                status: "payment_required",
                order_edit: edit,
                payment_collection: fullCollection[0],
                payment_session: paymentSession
            };
        }

        // 3. Confirm
        try {
            const { result: confirmedEdit } = await confirmOrderEditRequestWorkflow(container).run({
                input: {
                    order_id: parentOrderId,
                    confirmed_by: userId,
                }
            });
            this.logAudit("order_edit_confirm", { orderId: parentOrderId, orderEditId, userId, outcome: "confirmed" });
            return {
                status: "confirmed",
                order_edit: confirmedEdit
            };
        } catch (e: any) {
             const safeError = e instanceof Error ? e : new Error(String(e));
             logger.error("order-edit-confirm", "confirmOrderEditRequestWorkflow failed", { orderId: parentOrderId, orderEditId }, safeError);
             this.logAudit("order_edit_confirm", { orderId: parentOrderId, orderEditId, userId }, safeError);
             throw e;
        }
    }
}

export const guestOrderEditService = new GuestOrderEditService();
