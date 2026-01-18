
import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createOrdersWorkflow } from "@medusajs/core-flows";
import { guestOrderEditService } from "../services/guest-order-edit";

export default async function manualTestConfirm({ container }: ExecArgs) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    
    // 1. Get Variant
    const { data: variants } = await query.graph({ entity: "product_variant", fields: ["id"], pagination: { take: 1 } });
    const variantId = variants[0].id;

    // 2. Create Order
    const { data: regions } = await query.graph({ entity: "region", fields: ["id"], pagination: { take: 1 } });
    const regionId = regions[0].id;
    const { result: order } = await createOrdersWorkflow(container).run({
        input: { email: "confirm@test.com", currency_code: "usd", region_id: regionId, items: [{ title: "Item 1", variant_id: variantId, quantity: 1, unit_price: 1000 }] }
    });
    logger.info(`Created Order: ${order.id}`);

    // 3. Create Edit & Add Item
    const edit = await guestOrderEditService.getOrCreateActiveOrderEdit(container, order.id, "debug_user");
    logger.info(`Created Edit: ${edit.id}`);
    
    await guestOrderEditService.addItem(container, order.id, variantId, 1);
    logger.info("Item Added. Now Confirming...");

    // 4. Confirm (Service)
    try {
        const res = await guestOrderEditService.completeEdit(container, edit.id, "debug_user");
        console.log("Confirm Result:", res);
    } catch (e: any) {
        logger.error("Failed to Confirm");
        console.error("Full Error:", e);
        if (e.errors) console.error("Validation Errors:", JSON.stringify(e.errors, null, 2));
    }
}
