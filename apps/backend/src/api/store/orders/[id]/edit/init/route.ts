
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { guestOrderEditService } from "../../../../../../services/guest-order-edit";
import { logger } from "../../../../../../utils/logger";

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
        // 2. Get or Create Order Edit
        // We use a dummy "guest" ID or derive it from the order email if needed.
        // For now, passing "guest" as userId.
        const orderEdit = await guestOrderEditService.getOrCreateActiveOrderEdit(
            req.scope, 
            id, 
            "guest" 
        );

        res.status(200).json({
            order_edit: orderEdit,
        });
    } catch (error) {
        const safeError = error instanceof Error ? error : new Error(String(error));
        logger.error("order-edit-init", "Failed to initialize order edit", { orderId: id }, safeError);
        res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Failed to initialize order edit",
        });
    }
}
