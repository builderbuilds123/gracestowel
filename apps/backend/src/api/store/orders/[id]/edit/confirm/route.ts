
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { guestOrderEditService } from "../../../../../../services/guest-order-edit";

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

    try {
        // 2. Resolve Active Edit
        const orderEdit = await guestOrderEditService.getOrCreateActiveOrderEdit(
            req.scope, 
            id, 
            "guest" 
        );

        if (!orderEdit) {
             res.status(404).json({
                code: "NO_ACTIVE_EDIT",
                message: "No active order edit found to confirm.",
            });
            return;
        }

        // 3. Confirm (or Request Payment)
        const result = await guestOrderEditService.completeEdit(
            req.scope,
            orderEdit.id,
            "guest"
        );

        res.status(200).json(result);

    } catch (error) {
        const errorDetail = error instanceof Error ? error.message : JSON.stringify(error, Object.getOwnPropertyNames(error));
        console.error("Confirm Edit Error:", JSON.stringify(error, null, 2));
        res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Failed to confirm order edit",
            details: errorDetail,
            raw: JSON.stringify(error) 
        });
    }
}
