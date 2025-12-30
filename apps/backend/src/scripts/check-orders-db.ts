/**
 * Script to check orders in the database
 */
import { loadEnv } from '@medusajs/framework/utils';

loadEnv(process.env.NODE_ENV || 'development', process.cwd());

import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { MedusaAppLoader } from "@medusajs/framework";

async function checkOrdersInDb() {
    try {
        // Load Medusa container
        const loader = new MedusaAppLoader({
            cwd: process.cwd(),
        });
        const { container } = await loader.load() as any;

        const query = container.resolve("query");

        console.log("\n=== Recent Orders ===\n");

        // Get recent orders
        const { data: orders } = await query.graph({
            entity: "order",
            fields: ["id", "status", "payment_status", "metadata", "created_at", "updated_at"],
            filters: {},
        });

        // Sort by created_at descending
        const sortedOrders = orders.sort((a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        console.log(`Total orders: ${sortedOrders.length}\n`);

        for (const order of sortedOrders.slice(0, 10)) {
            const paymentIntentId = order.metadata?.stripe_payment_intent_id || "N/A";
            const needsRecovery = order.metadata?.needs_recovery ? "YES" : "NO";

            console.log(`Order ${order.id}:`);
            console.log(`  Status: ${order.status}`);
            console.log(`  Payment Status: ${order.payment_status || "N/A"}`);
            console.log(`  Payment Intent: ${paymentIntentId}`);
            console.log(`  Needs Recovery: ${needsRecovery}`);
            console.log(`  Created: ${new Date(order.created_at).toISOString()}`);
            console.log(`  Updated: ${new Date(order.updated_at).toISOString()}`);
            console.log("");
        }

        // Check for pending orders specifically
        const { data: pendingOrders } = await query.graph({
            entity: "order",
            fields: ["id", "status", "metadata", "created_at"],
            filters: {
                status: "pending",
            },
        });

        console.log(`\n=== Pending Orders: ${pendingOrders.length} ===\n`);

        for (const order of pendingOrders) {
            const paymentIntentId = order.metadata?.stripe_payment_intent_id || "N/A";
            const needsRecovery = order.metadata?.needs_recovery ? "YES" : "NO";
            const ageMinutes = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 1000 / 60);

            console.log(`Order ${order.id}:`);
            console.log(`  Payment Intent: ${paymentIntentId}`);
            console.log(`  Needs Recovery: ${needsRecovery}`);
            console.log(`  Age: ${ageMinutes} minutes`);
            console.log(`  Created: ${new Date(order.created_at).toISOString()}`);
            console.log("");
        }

        process.exit(0);
    } catch (error) {
        console.error("Error checking database:", error);
        process.exit(1);
    }
}

checkOrdersInDb();
