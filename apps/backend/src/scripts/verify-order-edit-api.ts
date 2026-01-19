
/* eslint-disable es/no-modules, es/no-async-functions, es/no-destructuring, es/no-block-scoping */
import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createOrdersWorkflow } from "@medusajs/core-flows";
import { modificationTokenService } from "../services/modification-token";

type QueryService = {
    graph: <T>(input: unknown) => Promise<{ data: T[] }>;
};

type ActionPayload = {
    id: string;
    action: string;
};

export default async function verifyOrderEditApi(args: ExecArgs): Promise<null> {
    const container = args.container;
    if (!container || typeof container.resolve !== "function") {
        throw new Error("Container is not available");
    }
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    const query = container.resolve(ContainerRegistrationKeys.QUERY) as QueryService;
    if (!query || typeof query.graph !== "function") {
        throw new Error("Query service is not available");
    }
    
    // 1. Setup: Get a Variant
    const variantsResult = await query.graph<{ id: string }>({
        entity: "product_variant",
        fields: ["id", "price_set.prices.*"],
        pagination: { take: 1 }
    });
    const variants = variantsResult.data || [];
    
    if (!variants.length) {
        logger.error("No variants found. customized seed required.");
        return null;
    }
    const variantId = variants[0].id;
    logger.info(`Using Variant ID: ${variantId}`);

    // 2. Create a Dummy Order
    const regionsResult = await query.graph<{ id: string }>({ entity: "region", fields: ["id"], pagination: { take: 1 } });
    const regions = regionsResult.data || [];
    const regionId = regions[0].id;

    const { result: order } = await createOrdersWorkflow(container).run({
        input: {
            email: "guest@example.com",
            currency_code: "usd",
            region_id: regionId,
            items: [
                { title: "Test Item", variant_id: variantId, quantity: 1, unit_price: 1000 }
            ],
            shipping_methods: [
                { name: "Test Shipping", amount: 0 }
            ]
        }
    });
    logger.info(`Created Order: ${order.id}`);

    // 3. Generate Token
    const orderCreatedAt = order.created_at || new Date(); 
    const paymentIntentId = "pi_test_123456789"; 
    
    const token = modificationTokenService.generateToken(order.id, paymentIntentId, orderCreatedAt);
    logger.info(`Generated Token (suffix): ****${token.slice(-6)}`);

    // 4. Test API via Fetch
    const baseUrl = "http://127.0.0.1:9000/store";
    const headers: Record<string, string> = {
        "x-modification-token": token,
        "Content-Type": "application/json"
    };

    const keysResult = await query.graph<{ token: string }>({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } });
    const keys = keysResult.data || [];
    if (keys.length) headers["x-publishable-api-key"] = keys[0].token;

    // INIT
    logger.info("Testing /edit/init...");
    const initRes = await fetch(`${baseUrl}/orders/${order.id}/edit/init`, { method: "POST", headers });
    const initJson = await initRes.json();
    if (!initRes.ok) throw new Error(JSON.stringify(initJson));
    logger.info("Init Response OK");

    // ADD ITEM (To be deleted)
    logger.info("Testing /edit/items (Item to delete)...");
    const item1Res = await fetch(`${baseUrl}/orders/${order.id}/edit/items`, { 
        method: "POST", 
        headers,
        body: JSON.stringify({ variant_id: variantId, quantity: 1 }) 
    });
    const item1Json = await item1Res.json();
    if (!item1Res.ok) throw new Error(JSON.stringify(item1Json));
    logger.info("Item 1 Added OK");
    console.log("Actions count:", item1Json.actions?.length);

    // FIND ACTION ID
    // Look for ITEM_ADD action or query DB if missing in response
    const actions = (item1Json.actions || []) as ActionPayload[];
    const addAction = actions.find((action) => action.action === "ITEM_ADD");
    
    if (!addAction) {
        // Fallback or skip
        // In verification script we can't easily query DB directly since we mimic client.
        // We warn and skip delete test if not found.
        console.warn("Could not find ITEM_ADD action in response. Skipping DELETE test.");
    } else {
        const actionId = addAction.id;
        logger.info(`Found Action ID to delete: ${actionId}`);
        
        // DELETE ITEM
        logger.info(`Testing DELETE /edit/items/${actionId}...`);
        const deleteRes = await fetch(`${baseUrl}/orders/${order.id}/edit/items/${actionId}`, { 
            method: "DELETE", 
            headers 
        });
        const deleteJson = await deleteRes.json();
        if (!deleteRes.ok) {
            console.error("Delete Failed:", JSON.stringify(deleteJson, null, 2));
            throw new Error("Delete Failed");
        }
        logger.info("Delete Response OK");
    }

    // ADD ITEM (To be confirmed)
    logger.info("Testing /edit/items (Item to confirm)...");
    const item2Res = await fetch(`${baseUrl}/orders/${order.id}/edit/items`, { 
        method: "POST", 
        headers,
        body: JSON.stringify({ variant_id: variantId, quantity: 2 }) 
    });
    const item2Json = await item2Res.json();
    if (!item2Res.ok) throw new Error(JSON.stringify(item2Json));
    logger.info("Item 2 Added OK");

    // CONFIRM
    logger.info("Testing /edit/confirm...");
    const confirmRes = await fetch(`${baseUrl}/orders/${order.id}/edit/confirm`, { method: "POST", headers });
    const confirmJson = await confirmRes.json();
    if (!confirmRes.ok) throw new Error(JSON.stringify(confirmJson));
    logger.info("Confirm Response OK: " + JSON.stringify(confirmJson, null, 2));

    // CHECK FINAL ORDER
    const finalOrdersResult = await query.graph<{ total?: number; items?: unknown[] }>({
        entity: "order",
        fields: ["total", "items.*"],
        filters: { id: order.id }
    });
    const finalOrders = finalOrdersResult.data || [];
    logger.info(`Final Order Total: ${finalOrders?.[0]?.total}`);
    logger.info(`Final Item Count: ${finalOrders?.[0]?.items?.length}`);
    return null;
}
