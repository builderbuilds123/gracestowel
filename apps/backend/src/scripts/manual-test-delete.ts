
import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createOrdersWorkflow } from "@medusajs/core-flows";
import { guestOrderEditService } from "../services/guest-order-edit";

export default async function manualTestDelete({ container }: ExecArgs) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    
    // 1. Get Variant
    const { data: variants } = await query.graph({
        entity: "product_variant",
        fields: ["id"],
        pagination: { take: 1 }
    });
    const variantId = variants[0].id;

    // 2. Create Order
    const { data: regions } = await query.graph({ entity: "region", fields: ["id"], pagination: { take: 1 } });
    const regionId = regions[0].id;

    const { result: order } = await createOrdersWorkflow(container).run({
        input: {
            email: "delete@test.com",
            currency_code: "usd",
            region_id: regionId,
            items: [{ title: "Item 1", variant_id: variantId, quantity: 1, unit_price: 1000 }],
        }
    });
    logger.info(`Created Order: ${order.id}`);

    // 3. Create Edit
    const edit = await guestOrderEditService.getOrCreateActiveOrderEdit(container, order.id, "debug_user");
    logger.info(`Created Edit: ${edit.id}`);

    // 4. Add Item
    logger.info("Adding Item to Delete...");
    const addItemRes = await guestOrderEditService.addItem(container, order.id, variantId, 1);
    
    // Find Action ID
    let actions = addItemRes.actions || [];
    
    if (!actions.length) {
         logger.warn("No actions in result. Querying DB...");
         const { data: qEdits } = await query.graph({
             entity: "order_change",
             fields: ["actions.*"],
             filters: { id: edit.id }
         });
         actions = qEdits[0].actions || [];
         logger.info(`DB Actions Count: ${actions.length}`);
    }

    const addAction = actions.find((a: any) => a.action === "ITEM_ADD");
    
    if (!addAction) {
        console.error("Failed to find action even in DB. Actions:", JSON.stringify(actions, null, 2));
        throw new Error("Action not found");
    }
    
    const actionId = addAction.id;
    logger.info(`Found Action ID to Delete: ${actionId}`);

    // 5. Remove Item (Service)
    try {
        logger.info("Removing Item...");
        const res = await guestOrderEditService.removeItem(container, order.id, actionId);
        logger.info("Item Removed Successfully");
        
        // Verify removal by checking active actions
        const { data: checkEdits } = await query.graph({
            entity: "order_change",
            fields: ["actions.*"],
            filters: { id: edit.id }
        });
        const finalActions = checkEdits[0].actions || [];
        const deletedAction = finalActions.find((a: any) => a.id === actionId);
        if (!deletedAction) {
             logger.info("Action is gone from DB (Success)");
        } else {
             logger.info(`Action status: ${deletedAction.action}`); 
             // Normally deleting a pending action removes it or marks it irrelevant?
             // deleteOrderChangeActionsStep physically deletes it usually.
        }

    } catch (e: any) {
        logger.error("Failed to Remove Item");
        console.error("Full Error:", e);
        if (e.errors) console.error("Validation Errors:", JSON.stringify(e.errors, null, 2));
        throw e;
    }
}
