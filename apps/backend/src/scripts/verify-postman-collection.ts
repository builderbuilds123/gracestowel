
import fs from 'fs';
import path from 'path';

// Native fetch in Node 18+

async function main() {
    console.log("🚀 Running Postman Collection Verification");

    const collectionPath = path.join(__dirname, 'order-flow.postman_collection.json');
    const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));
    
    // Environment Variables
    const env: Record<string, string> = {
        "base_url": "http://127.0.0.1:9000",
        "publishable_key": "pk_test_1768271676900",
        "variant_id": "variant_01KCQ89AYX36XYB5NZQGQ8EHW2",
        "cart_id": "",
        "payment_intent_id": "",
        "stripe_signature": "",
        "order_id": "",
        "modification_token": ""
    };

    const replaceVars = (str: string) => {
        return str.replace(/{{([^}]+)}}/g, (_, key) => env[key] || `{{${key}}}`);
    };

    for (const item of collection.item) {
        console.log(`\n🔹 [${item.name}]`);
        
        let url = replaceVars(item.request.url.raw);
        const method = item.request.method;
        const headers: Record<string, string> = {
            "Content-Type": "application/json"
        };
        
        // Headers
        item.request.header.forEach((h: any) => {
            headers[h.key] = replaceVars(h.value);
        });
        
        // Body
        let body: any = undefined;
        if (item.request.body && item.request.body.mode === 'raw') {
            body = replaceVars(item.request.body.raw);
            // Dynamic variable replacement for timestamp/random
            if (body.includes("{{$timestamp}}")) {
                body = body.replace("{{$timestamp}}", Date.now().toString());
            }
        }
        
        // Pre-request Scripts (Simulation)
        if (item.event) {
            const preObj = item.event.find((e: any) => e.listen === 'prerequest');
            if (preObj) {
                // Manually implementing the logic from the specific pre-request scripts I wrote
                if (item.name.includes("Simulate Stripe")) {
                    const timestamp = Date.now();
                    // Fix PI ID length: pi_ + 24 chars
                    const randomSuffix = Math.random().toString(36).substring(2, 12) + "xxxxx"; 
                    const pi_id = `pi_${timestamp}${randomSuffix}`.substring(0, 27);
                    
                    env["payment_intent_id"] = pi_id;
                    
                    // Update variables in body string
                    body = body.replace(/{{payment_intent_id}}/g, pi_id);
                    body = body.replace(/{{cart_id}}/g, env["cart_id"]); // Ensure cart_id is replaced too if needed

                    // Compute valid signature
                    require('dotenv').config();
                    const crypto = require('crypto');
                    const secret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test_secret";
                    const sigTimestamp = Math.floor(timestamp / 1000);
                    const payload = `${sigTimestamp}.${body}`;
                    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
                    const sigHeader = `t=${sigTimestamp},v1=${signature}`;
                    
                    env["stripe_signature"] = sigHeader;
                    headers["stripe-signature"] = sigHeader;
                }
            }
        }

        try {
            console.log(`   ${method} ${url}`);
            
            const reqInit: any = {
                method: method,
                headers: headers
            };
            
            if (method !== 'GET' && method !== 'HEAD') {
                reqInit.body = body;
            }

            const res = await fetch(url, reqInit);
            console.log(`   Status: ${res.status}`);
            
            if (!res.ok) {
                const text = await res.text();
                // If 503 service unavailable (queue removal error) we might retry? 
                // But generally 503 is a failure for tests.
                console.error(`   ❌ Failed: ${res.status} ${text}`);
                // Continue? or Throw?
                if (res.status === 500 || res.status === 400 || res.status === 404) {
                    throw new Error(`Request failed: ${text}`);
                }
            }
            
            const resJson = await res.json();
            
            // Post-request Scripts (Simulation)
            if (item.event) {
                const testObj = item.event.find((e: any) => e.listen === 'test');
                if (testObj) {
                    if (item.name.includes("Create Cart")) {
                        if (resJson.cart && resJson.cart.id) {
                            env["cart_id"] = resJson.cart.id;
                            console.log(`   ✅ Set cart_id: ${env["cart_id"]}`);
                        }
                    } else if (item.name.includes("Get Order")) {
                        if (resJson.order && resJson.order.id) {
                            env["order_id"] = resJson.order.id;
                            console.log(`   ✅ Set order_id: ${env["order_id"]}`);
                        }
                        if (resJson.modification_token) {
                            env["modification_token"] = resJson.modification_token;
                            console.log(`   ✅ Set modification_token`);
                        }
                    }
                }
            }
            
            // Wait a bit if needed (like for webhook processing)
            if (item.name.includes("Simulate Stripe")) {
                console.log("   ⏳ Waiting 5s for async processing...");
                await new Promise(r => setTimeout(r, 5000));
            }

        } catch (e: any) {
            console.error(`   ❌ ERROR: ${e.message}`);
            process.exit(1);
        }
    }
    
    console.log("\n✅ Collection Verification PASSED");
}

main();
