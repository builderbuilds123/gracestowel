
import { getDbClient, getPublishableApiKey, CONFIG, sleep } from './utils';

async function main() {
    console.log("🚀 Starting System Verification Script (Fixed Flow)");

    const client = await getDbClient();

    try {
        // 0. Get Publishable Key
        const apiKey = await getPublishableApiKey(client);
        console.log(`🔑 API Key: ${apiKey.substring(0, 10)}... (Redacted)`);

        // 1. Get a Valid Product Variant
        console.log("🤔 Querying for variant...");
        // Prefer the configured test variant if simple check passes, otherwise query
        let variantId = CONFIG.TEST_VARIANT_ID;
        
        // Optional: Verify it exists/has stock if we wanted to be strict, 
        // but for now relying on the standard ID is cleaner for consistency.
        console.log(`📦 Using Variant: ${variantId}`);

        // 2. Create Cart
        console.log("🛒 Creating Cart...");
        const cartRes = await fetch(`${CONFIG.API_URL}/store/carts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-publishable-api-key": apiKey },
            body: JSON.stringify({ email: "verify@test.com" })
        });
        if (!cartRes.ok) throw new Error(`Cart creation failed: ${await cartRes.text()}`);
        const { cart } = await cartRes.json();
        console.log(`✅ Cart ID: ${cart.id}`);

        // 3. Add Line Item
        console.log("➕ Adding Item...");
        const lineRes = await fetch(`${CONFIG.API_URL}/store/carts/${cart.id}/line-items`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-publishable-api-key": apiKey },
            body: JSON.stringify({ variant_id: variantId, quantity: 1 })
        });
        if (!lineRes.ok) throw new Error(`Add item failed: ${await lineRes.text()}`);
        console.log("✅ Item added");

        // 4. Simulate Stripe Webhook
        const timestamp = Date.now().toString();
        const randomSuffix = Math.random().toString(36).substring(2, 12) + "xxxxx";
        const paymentIntentId = `pi_${timestamp}${randomSuffix}`.substring(0, 27);
        console.log(`⚡ Simulating Stripe Webhook for PI: ${paymentIntentId}`);

        const event = {
            id: `evt_${Date.now()}`,
            object: "event",
            type: "payment_intent.succeeded",
            data: {
                object: {
                    id: paymentIntentId,
                    amount: 1000,
                    currency: "usd",
                    metadata: { cart_id: cart.id },
                    shipping: {
                        name: "Test User",
                        address: { line1: "123 St", city: "City", country: "US", postal_code: "12345" }
                    }
                }
            }
        };

        const payloadString = JSON.stringify(event);
        const secret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test_secret";
        const sigTimestamp = Math.floor(Date.now() / 1000);
        const crypto = require('crypto');
        const signature = crypto.createHmac('sha256', secret).update(`${sigTimestamp}.${payloadString}`).digest('hex');

        const webhookRes = await fetch(`${CONFIG.API_URL}/webhooks/stripe`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "stripe-signature": `t=${sigTimestamp},v1=${signature}`
            },
            body: payloadString
        });

        if (!webhookRes.ok) {
            console.log(`⚠️ Webhook failed: ${webhookRes.status} ${await webhookRes.text()}`);
        } else {
            console.log("✅ Webhook accepted");
        }

        // Wait for worker
        console.log("⏳ Waiting 5s for order processing...");
        await sleep(5000);

        // 5. Check Order and Reservations
        const orderRes = await client.query(`SELECT id, status, metadata FROM "order" WHERE metadata->>'stripe_payment_intent_id' = $1`, [paymentIntentId]);
        if (orderRes.rows.length === 0) {
            console.error("❌ Order NOT created!");
        } else {
            const orderId = orderRes.rows[0].id;
            const modificationToken = orderRes.rows[0].metadata?.modification_token;
            console.log(`✅ Order Created: ${orderId} (Status: ${orderRes.rows[0].status})`);
            if (modificationToken) console.log(`   Modification Token Present`);

            // Check Reservations
            const resRes = await client.query(`SELECT * FROM reservation_item WHERE metadata->>'order_id' = $1`, [orderId]);
            if (resRes.rows.length === 0) {
                 console.error("❌ No reservations found for this order!");
            } else {
                 console.log(`✅ Found ${resRes.rows.length} reservation(s).`);
            }

            // 6. Cancel Order
            console.log("🚫 Attempting Cancellation...");
            
            let modToken = modificationToken;
            if (!modToken) {
                 // Try fetch
                 const tokenRes = await fetch(`${CONFIG.API_URL}/store/orders/by-payment-intent?payment_intent_id=${paymentIntentId}`, {
                    headers: { "x-publishable-api-key": apiKey }
                 });
                 if (tokenRes.ok) {
                     const data = await tokenRes.json();
                     modToken = data.modification_token;
                 }
            }

            if (!modToken) {
                console.error("❌ Could not get modification token. Cannot cancel.");
            } else {
                const cancelRes = await fetch(`${CONFIG.API_URL}/store/orders/${orderId}/cancel`, {
                    method: "POST",
                    headers: {
                        "x-publishable-api-key": apiKey,
                        "Content-Type": "application/json",
                        "x-modification-token": modToken
                    },
                    body: JSON.stringify({ order_id: orderId })
                });

                if (!cancelRes.ok) {
                    console.error(`❌ Cancel failed: ${cancelRes.status} ${await cancelRes.text()}`);
                } else {
                    console.log("✅ Cancel Request OK");
                    
                    // 7. Verify Reservation Release
                    const verifyRes = await client.query(`SELECT * FROM reservation_item WHERE metadata->>'order_id' = $1`, [orderId]);
                    const active = verifyRes.rows.filter(r => !r.deleted_at);
                    if (active.length === 0) {
                         console.log("✅ Reservations Released (Soft Deleted)");
                    } else {
                         console.error(`❌ ${active.length} Reservations still ACTIVE!`);
                    }
                }
            }
        }

    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        await client.end();
    }
}

main();

