import { ModificationTokenService } from "../services/modification-token";
import { Client } from "pg";
import Stripe from "stripe";
import { Queue } from "bullmq";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/**
 * Medusa Test CLI - Secure & Consolidated
 * 
 * Provides a unified interface for system debugging and testing 
 * without exposing sensitive credentials in code.
 */

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === "--help" || command === "-h") {
        printHelp();
        return;
    }

    try {
        switch (command) {
            case "order":
                await handleOrder(args.slice(1));
                break;
            case "payment":
                await handlePayment(args.slice(1));
                break;
            case "inventory":
                await handleInventory(args.slice(1));
                break;
            case "queue":
                await handleQueue(args.slice(1));
                break;
            case "api":
                await handleApi(args.slice(1));
                break;
            case "token":
                await handleToken(args.slice(1));
                break;
            default:
                console.error(`Unknown command: ${command}`);
                printHelp();
                process.exit(1);
        }
    } catch (error: any) {
        console.error(`\n[ERROR] ${error.message}`);
        process.exit(1);
    }
}

function printHelp() {
    console.log(`
Medusa Unified Test CLI
Usage: npx ts-node src/scripts/test-cli.ts <command> [options]

Commands:
  order      List recent orders or get details for a specific order
             Options: --id <id>, --limit <n>, --status <status>

  payment    Check Stripe status and Medusa PaymentCollection status
             Options: --pi-id <id>, --order-id <id>

  inventory  Check stock levels for a variant or SKU
             Options: --variant-id <id>, --sku <sku>

  queue      Check BullMQ payment-capture queue status
             Options: --status (counts only), --jobs (list specific jobs)

  api        Get system API information (Publishable Key, Providers)
             Options: --keys, --providers

  token      Generate a modification token for an order
             Options: --order-id <id>, --pi-id <id>, --created-at <iso_date>

Global Setup:
  Ensure .env is configured in apps/backend/ with DATABASE_URL, STRIPE_SECRET_KEY, 
  REDIS_URL, and JWT_SECRET.
    `);
}

/**
 * COMMAND: order
 */
async function handleOrder(args: string[]) {
    const orderId = getArgValue(args, "--id");
    const limit = parseInt(getArgValue(args, "--limit") || "10");
    const status = getArgValue(args, "--status");

    await runQuery(async (client) => {
        let query = `
            SELECT id, status, display_id, currency_code, created_at, metadata 
            FROM "order"
        `;
        const params: any[] = [];

        if (orderId) {
            query += " WHERE id = $1";
            params.push(orderId);
        } else if (status) {
            query += " WHERE status = $1 ORDER BY created_at DESC LIMIT $2";
            params.push(status, limit);
        } else {
            query += " ORDER BY created_at DESC LIMIT $1";
            params.push(limit);
        }

        const res = await client.query(query, params);
        if (res.rows.length === 0) {
            console.log("No orders found.");
        } else {
            console.log(`\n--- ${orderId ? 'Order Details' : 'Recent Orders'} ---`);
            const rows = res.rows.map(r => ({
                ...r,
                metadata: JSON.stringify(r.metadata).substring(0, 50) + "..."
            }));
            console.table(rows);
            
            if (orderId && res.rows[0].metadata) {
                console.log("\nFull Metadata:");
                console.log(JSON.stringify(res.rows[0].metadata, null, 2));
            }
        }
    });
}

/**
 * COMMAND: payment
 */
async function handlePayment(args: string[]) {
    const piId = getArgValue(args, "--pi-id");
    const orderId = getArgValue(args, "--order-id");

    if (piId) {
        console.log(`\n--- Stripe PaymentIntent: ${piId} ---`);
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-10-29.clover" as any });
        const pi = await stripe.paymentIntents.retrieve(piId);
        console.log(`Status: ${pi.status}`);
        console.log(`Amount: ${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()}`);
        console.log(`Capture: ${pi.capture_method}`);
        console.log(`Created: ${new Date(pi.created * 1000).toISOString()}`);
    }

    if (orderId) {
        await runQuery(async (client) => {
            console.log(`\n--- Medusa Payment Collections for Order: ${orderId} ---`);
            const query = `
                SELECT pc.id, pc.status, pc.amount, pc.currency_code, pc.created_at
                FROM payment_collection pc
                JOIN order_payment_collection opc ON pc.id = opc.payment_collection_id
                WHERE opc.order_id = $1
            `;
            const res = await client.query(query, [orderId]);
            if (res.rows.length === 0) {
                console.log("No payment collections found for this order.");
            } else {
                console.table(res.rows);
            }
        });
    }

    if (!piId && !orderId) {
        console.error("Please provide --pi-id or --order-id");
    }
}

/**
 * COMMAND: inventory
 */
async function handleInventory(args: string[]) {
    const variantId = getArgValue(args, "--variant-id");
    const sku = getArgValue(args, "--sku");

    await runQuery(async (client) => {
        let query = `
            SELECT v.id as var_id, v.sku, v.title, il.stocked_quantity as stocked, 
                   il.reserved_quantity as reserved, 
                   (il.stocked_quantity - il.reserved_quantity) as avail
            FROM product_variant v
            JOIN product_variant_inventory_item pviv ON v.id = pviv.variant_id
            JOIN inventory_level il ON pviv.inventory_item_id = il.inventory_item_id
        `;
        const params: any[] = [];
        if (variantId) {
            query += " WHERE v.id = $1";
            params.push(variantId);
        } else if (sku) {
            query += " WHERE v.sku = $1";
            params.push(sku);
        } else {
            query += " LIMIT 20";
        }

        const res = await client.query(query, params);
        console.table(res.rows);
    });
}

/**
 * COMMAND: queue
 */
async function handleQueue(args: string[]) {
    const showJobs = args.includes("--jobs");
    const queueName = "payment-capture";
    
    console.log(`\n--- BullMQ Queue: ${queueName} ---`);
    const queue = new Queue(queueName, {
        connection: { url: process.env.REDIS_URL || "redis://localhost:6379" }
    });

    try {
        const counts = await queue.getJobCounts();
        console.log("Status Counts:");
        console.table([counts]);

        if (showJobs) {
            const jobs = await queue.getJobs(['waiting', 'active', 'delayed', 'failed'], 0, 50, true);
            if (jobs.length === 0) {
                console.log("No pending jobs found.");
            } else {
                const jobList = jobs.map(j => ({
                    id: j.id,
                    data: JSON.stringify(j.data),
                    timestamp: new Date(j.timestamp).toISOString(),
                    delay: j.opts.delay || 0
                }));
                console.table(jobList);
            }
        }
    } finally {
        await queue.close();
    }
}

/**
 * COMMAND: api
 */
async function handleApi(args: string[]) {
    const showKeys = args.includes("--keys");
    
    await runQuery(async (client) => {
        if (showKeys || args.length === 0) {
            console.log("\n--- Publishable API Keys ---");
            const res = await client.query("SELECT title, token, created_at FROM api_key WHERE type = 'publishable'");
            console.table(res.rows);
        }
        
        console.log("\n--- Active Shipping Options ---");
        const res = await client.query("SELECT id, name, price_type, provider_id FROM shipping_option WHERE deleted_at IS NULL");
        console.table(res.rows);
    });
}

/**
 * COMMAND: token (Existing logic)
 */
async function handleToken(args: string[]) {
    const orderId = getArgValue(args, "--order-id");
    const piId = getArgValue(args, "--pi-id");
    const createdAtStr = getArgValue(args, "--created-at");

    if (!orderId || !piId) {
        throw new Error("Missing --order-id or --pi-id");
    }

    const service = new ModificationTokenService();
    const createdAt = createdAtStr ? new Date(createdAtStr) : new Date();
    const token = service.generateToken(orderId, piId, createdAt);
    
    console.log("\n--- GENERATED TOKEN ---");
    console.log(token);
    console.log("-----------------------\n");
}

/**
 * HELPERS
 */
async function runQuery(callback: (client: Client) => Promise<void>) {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    try {
        await client.connect();
        await callback(client);
    } finally {
        await client.end();
    }
}

function getArgValue(args: string[], flag: string): string | undefined {
    const index = args.indexOf(flag);
    if (index !== -1 && args[index + 1]) {
        return args[index + 1];
    }
    return undefined;
}

main().catch(console.error);
