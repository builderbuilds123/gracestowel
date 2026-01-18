
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { guestOrderEditService } from "../../../../../../services/guest-order-edit";
import { z } from "zod";

const AddItemSchema = z.object({
    variant_id: z.string(),
    quantity: z.number().int().positive(),
});

export async function POST(
    req: MedusaRequest,
    res: MedusaResponse
): Promise<void> {
    const { id } = req.params;
    
    // 1. Validate Token
    const validation = guestOrderEditService.validateRequest(req, id);
    if (!validation.valid) {
        res.status(401).json({
            code: validation.code,
            message: validation.error,
        });
        return;
    }

    // 2. Validate Body
    const bodyResult = AddItemSchema.safeParse(req.body);
    if (!bodyResult.success) {
        res.status(400).json({
            code: "INVALID_INPUT",
            message: "Invalid request body",
            errors: bodyResult.error.issues,
        });
        return;
    }
    const { variant_id, quantity } = bodyResult.data;

    try {
        // 4. Add Item Confirmation
        // Service expects Order ID (not Edit ID) for add item workflow
        const result = await guestOrderEditService.addItem(
            req.scope,
            id, // Order ID from params
            variant_id,
            quantity
        );

        res.status(200).json({
            order_edit: result,
        });
    } catch (error) {
        const errorDetail = error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error));
        console.error("Add Item Error:", JSON.stringify(error, null, 2)); // Detailed server log
        res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Failed to add item to order edit",
            details: errorDetail,
            raw: JSON.stringify(error) // Send to client for debug script to see
        });
    }
}
