
import { getDbClient, CONFIG } from './utils';

async function forceRestock() {
    const client = await getDbClient();

    try {
        const variantId = CONFIG.TEST_VARIANT_ID;
        console.log(`🛠️ Forcing restock for variant: ${variantId}`);

        // 1. Get Inventory Item ID
        const linkRes = await client.query(
            `SELECT inventory_item_id FROM product_variant_inventory_item WHERE variant_id = $1`,
            [variantId]
        );

        if (linkRes.rows.length === 0) {
            console.error("❌ Link not found for variant");
            return;
        }

        const inventoryItemId = linkRes.rows[0].inventory_item_id;
        console.log(`📦 Inventory Item ID: ${inventoryItemId}`);

        // 2. Clear Reservations
        await client.query(
            `DELETE FROM reservation_item WHERE inventory_item_id = $1`,
            [inventoryItemId]
        );
        console.log("✅ Reservations cleared.");

        // 3. Update Stock to 100
        await client.query(
            `UPDATE inventory_level SET stocked_quantity = 100, reserved_quantity = 0 WHERE inventory_item_id = $1`,
            [inventoryItemId]
        );
        console.log("✅ Stock updated to 100.");
        
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await client.end();
    }
}

forceRestock();
