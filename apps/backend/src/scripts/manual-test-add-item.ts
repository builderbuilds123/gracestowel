
/* eslint-disable es/no-modules, es/no-async-functions, es/no-destructuring, es/no-block-scoping */
import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createOrdersWorkflow } from "@medusajs/core-flows";
import { guestOrderEditService } from "../services/guest-order-edit";

type QueryService = {
    graph: <T>(input: unknown) => Promise<{ data: T[] }>;
};

export default async function manualTestAddItem(args: ExecArgs): Promise<null> {
    const container = args.container;
    if (!container || typeof container.resolve !== "function") {
        throw new Error("Container is not available");
    }
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    const query = container.resolve(ContainerRegistrationKeys.QUERY) as QueryService;
    if (!query || typeof query.graph !== "function") {
        throw new Error("Query service is not available");
    }
    
    // 1. Get Variant
    const variantsResult = await query.graph<{ id: string }>({
        entity: "product_variant",
        fields: ["id"],
        pagination: { take: 1 }
    });
    const variants = variantsResult.data || [];
    const variantId = variants[0]?.id;
    if (!variantId) {
        logger.error("Variant ID missing from query result");
        return null;
    }

    // 2. Create Order
    const regionsResult = await query.graph<{ id: string }>({ entity: "region", fields: ["id"], pagination: { take: 1 } });
    const regions = regionsResult.data || [];
    const regionId = regions[0].id;

    const { result: order } = await createOrdersWorkflow(container).run({
        input: {
            email: "manual@test.com",
            currency_code: "usd",
            region_id: regionId,
            items: [{ title: "Item 1", variant_id: variantId, quantity: 1, unit_price: 1000 }],
        }
    });
    logger.info(`Created Order: ${order.id}`);

    // 3. Create Edit (Service)
    const edit = await guestOrderEditService.getOrCreateActiveOrderEdit(container, order.id, "debug_user");
    logger.info(`Created Edit: ${edit.id}`);

    // 4. Add Item (Service) with Try/Catch
    try {
        logger.info("Adding Item...");
        const res = await guestOrderEditService.addItem(container, order.id, variantId, 1);
        logger.info("Item Added Successfully");
        console.log(res);
    } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("Failed to Add Item", error);
        const errors = typeof err === "object" && err !== null && "errors" in err ? (err as { errors?: unknown }).errors : undefined;
        if (errors) {
            console.error("Validation Errors:", JSON.stringify(errors, null, 2));
        }
    }
    return null;
}
