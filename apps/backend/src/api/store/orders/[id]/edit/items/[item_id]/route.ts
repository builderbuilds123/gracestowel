import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { guestOrderEditService } from "../../../../../../../services/guest-order-edit";
import { z } from "zod";

const updateSchema = z.object({
    quantity: z.number().min(0)
});

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
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
    const validated = updateSchema.safeParse(req.body);
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
        const errorDetail = error instanceof Error ? error.message : JSON.stringify(error);
        console.error("Update Item Error:", errorDetail);
        
        res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Failed to update item quantity",
            details: errorDetail
        });
    }
};
