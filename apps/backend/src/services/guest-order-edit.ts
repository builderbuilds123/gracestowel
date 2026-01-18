
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

type ValidationResult = {
    valid: boolean;
    error?: string;
    code?: string;
    payload?: any;
    orderId?: string;
};

class GuestOrderEditService {
    
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
            return existingEdits[existingEdits.length - 1];
        }

        // Create new Order Change (Edit)
        const { result } = await createOrderChangeWorkflow(container).run({
            input: {
                order_id: orderId,
                change_type: "edit",
                created_by: userId || "guest_user",
                description: "Guest Order Modification", 
            },
        });
        
        return result;
    }

    async addItem(container: any, orderId: string, variantId: string, quantity: number) {
        // Input: { order_id: string (PARENT ORDER ID), items: Array<{ variant_id, quantity }> }
        const { result } = await orderEditAddNewItemWorkflow(container).run({
            input: {
                order_id: orderId, 
                items: [{
                    variant_id: variantId,
                    quantity: quantity,
                }]
            }
        });
        return result;
    }

    async removeItem(container: any, orderId: string, actionId: string) {
        // removeItemOrderEditActionWorkflow expects { order_id, action_id }
        const { result } = await removeItemOrderEditActionWorkflow(container).run({
            input: {
                order_id: orderId,
                action_id: actionId,
            }
        });
        return result;
    }

    async updateItemQuantity(container: any, orderId: string, itemIdOrActionId: string, quantity: number) {
        // Determine if it's an action or a line item
        if (itemIdOrActionId.startsWith("orchact_")) {
            // It's an action (item added during edit)
            const { result } = await updateOrderEditItemQuantityWorkflow(container).run({
                input: {
                    order_id: orderId,
                    action_id: itemIdOrActionId,
                    data: { quantity }
                }
            });
            return result;
        } else {
            // It's an original line item
            const { result } = await orderEditUpdateItemQuantityWorkflow(container).run({
                input: {
                    order_id: orderId,
                    items: [{
                        id: itemIdOrActionId,
                        quantity
                    }]
                }
            });
            return result;
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
            console.error("requestOrderEditRequestWorkflow Failed:", e);
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
        
        const isPaid = paymentCollection?.status === 'authorized';

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
            return {
                status: "confirmed",
                order_edit: confirmedEdit
            };
        } catch (e: any) {
             console.error("confirmOrderEditRequestWorkflow Failed:", e);
             throw e;
        }
    }
}

export const guestOrderEditService = new GuestOrderEditService();
