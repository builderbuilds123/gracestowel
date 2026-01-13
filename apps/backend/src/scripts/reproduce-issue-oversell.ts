
import { getDbClient, getPublishableApiKey, CONFIG, sleep } from './utils';

async function main() {
    console.log("🚀 Starting Oversell Reproduction Script");

    const client = await getDbClient();

    try {
        const apiKey = await getPublishableApiKey(client);
        const variantId = CONFIG.TEST_VARIANT_ID;

        // 1. Get Inventory Item ID for the variant
        const linkRes = await client.query(`
            SELECT inventory_item_id
            FROM product_variant_inventory_item
            WHERE variant_id = $1
            LIMIT 1
        `, [variantId]);
        
        if (linkRes.rows.length === 0) throw new Error("No linked inventory item found for test variant");
        const inventoryItemId = linkRes.rows[0].inventory_item_id;
        console.log(`📦 Using Variant: ${variantId}, Inventory Item: ${inventoryItemId}`);

        // 2. FORCE Stock to 2 and Clear Reservations
        console.log("🛠️ Resetting Stock to 2 and Reserved to 0...");
        await client.query(`UPDATE inventory_level SET stocked_quantity = 2, reserved_quantity = 0 WHERE inventory_item_id = $1`, [inventoryItemId]);
        await client.query(`DELETE FROM reservation_item WHERE inventory_item_id = $1`, [inventoryItemId]);

        // 3. Create 3 Carts and Try to Order
        const createOrder = async (idx: number) => {
            console.log(`[${idx}] Creating Order Process...`);
            
            // Cart
            const cartRes = await fetch(`${CONFIG.API_URL}/store/carts`, {
                method: "POST", 
                headers: { "Content-Type": "application/json", "x-publishable-api-key": apiKey },
                body: JSON.stringify({ email: `repro_${idx}@test.com` })
            });
            const { cart } = await cartRes.json();
            
            // Add Item
            await fetch(`${CONFIG.API_URL}/store/carts/${cart.id}/line-items`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-publishable-api-key": apiKey },
                body: JSON.stringify({ variant_id: variantId, quantity: 1 })
            });
            
            // Webhook (Order Creation)
            const paymentIntentId = `pi_${Date.now()}_${idx}_${Math.random().toString(36).substring(7)}`.substring(0, 27);
            const event = {
                id: `evt_${Date.now()}_${idx}`,
                object: "event",
                type: "payment_intent.succeeded",
                data: {
                    object: {
                        id: paymentIntentId,
                        amount: 1000,
                        currency: "usd",
                        metadata: { cart_id: cart.id },
                        shipping: { name: "Test", address: { line1: "X", city: "X", country: "US", postal_code: "11111" } }
                    }
                }
            };
            
            const secret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test_secret";
            const crypto = require('crypto');
            const sigTimestamp = Math.floor(Date.now() / 1000);
            const signature = crypto.createHmac('sha256', secret).update(`${sigTimestamp}.${JSON.stringify(event)}`).digest('hex');
            
            await fetch(`${CONFIG.API_URL}/webhooks/stripe`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "stripe-signature": `t=${sigTimestamp},v1=${signature}` },
                body: JSON.stringify(event)
            });
            
            console.log(`[${idx}] Webhook sent (PI: ${paymentIntentId})`);
            return paymentIntentId;
        };

        const pi1 = await createOrder(1);
        const pi2 = await createOrder(2);
        const pi3 = await createOrder(3);

        // Wait for workers
        console.log("⏳ Waiting 8s for processing...");
        await sleep(8000);

        // 4. Verify Reservations
        const countRes = await client.query(`SELECT count(*) FROM reservation_item WHERE inventory_item_id = $1`, [inventoryItemId]);
        const count = parseInt(countRes.rows[0].count);
        console.log(`📊 Total Reservations: ${count} / Stock: 2`);

        if (count > 2) {
            console.error("❌ OVERSELL DETECTED! Created more reservations than stock!");
        } else {
            console.log("✅ Stock limit respected.");
        }

        // Check if 3 orders exist
        const orderCount = await client.query(`SELECT count(*) FROM "order" WHERE metadata->>'stripe_payment_intent_id' IN ($1, $2, $3)`, [pi1, pi2, pi3]);
        console.log(`📊 Total Orders Created: ${orderCount.rows[0].count}`);

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

main();
