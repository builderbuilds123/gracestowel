import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { guestOrderEditService } from "../../../../../../../services/guest-order-edit";
import { z } from "zod";
import { logger } from "../../../../../../../utils/logger";

const updateSchema = z.object({
    quantity: z.number().int().min(0)
});

export const POST = async (req: MedusaRequest, res: MedusaResponse): Promise<void> => {
    const { id, item_id } = req.params;
    
    // 1. Validate Token
    const validation = guestOrderEditService.validateRequest(req, id);
    if (!validation.valid) {
        res.status(401).json({ 
            message: validation.error, 
            code: validation.code 
        });
        return;
    }

    // 2. Validate Body
    const body = (req as { body?: unknown }).body;
    const validated = updateSchema.safeParse(body);
    if (!validated.success) {
        res.status(400).json({ 
            message: "Invalid request body", 
            errors: validated.error.issues 
        });
        return;
    }

    try {
        // 3. Update Item Quantity
        const result = await guestOrderEditService.updateItemQuantity(
            req.scope,
            id,
            item_id,
            validated.data.quantity
        );

        res.status(200).json(result);

    } catch (error) {
        const safeError = error instanceof Error ? error : new Error(String(error));
        logger.error("order-edit-items", "Failed to update item quantity", { orderId: id, itemId: item_id, quantity: validated.data.quantity }, safeError);
        
        res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Failed to update item quantity",
        });
    }
};

export const DELETE = async (req: MedusaRequest, res: MedusaResponse): Promise<void> => {
    const { id, item_id } = req.params;

    const validation = guestOrderEditService.validateRequest(req, id);
    if (!validation.valid) {
        res.status(401).json({ 
            message: validation.error, 
            code: validation.code 
        });
        return;
    }

    try {
        const result = await guestOrderEditService.removeItem(
            req.scope,
            id,
            item_id
        );

        res.status(200).json(result);
    } catch (error) {
        const safeError = error instanceof Error ? error : new Error(String(error));
        logger.error("order-edit-items", "Failed to remove item from order edit", { orderId: id, actionId: item_id }, safeError);
        
        res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Failed to remove item from order edit",
        });
    }
};
