import type { LoaderFunctionArgs } from "react-router";
import { getDbClient } from "~/lib/db.server";
import { getProductsFromDB, isHyperdriveAvailable } from "~/lib/products.server";

/**
 * Test endpoint for Hyperdrive database connection
 * GET /api/test-hyperdrive
 */
export async function loader({ context }: LoaderFunctionArgs) {
    const env = (context as any)?.cloudflare?.env;
    
    const result: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        hyperdrive: {
            available: false,
            connectionString: null,
        },
        directConnection: {
            available: false,
        },
        tests: {},
    };

    // Check Hyperdrive availability
    const hyperdriveBinding = env?.HYPERDRIVE;
    if (hyperdriveBinding?.connectionString) {
        result.hyperdrive = {
            available: true,
            connectionString: hyperdriveBinding.connectionString.replace(/:[^:@]+@/, ':****@'), // Mask password
        };
    }

    // Check direct DATABASE_URL
    const directUrl = env?.DATABASE_URL || process.env.DATABASE_URL;
    if (directUrl) {
        result.directConnection = {
            available: true,
            connectionString: directUrl.replace(/:[^:@]+@/, ':****@'), // Mask password
        };
    }

    // Check if any connection is available using the helper
    result.isHyperdriveAvailable = isHyperdriveAvailable(context as any);

    // Test 1: Raw database connection
    try {
        const startTime = Date.now();
        const client = await getDbClient(context as any);
        const connectLatency = Date.now() - startTime;
        
        // Simple query to test connection
        const queryStart = Date.now();
        const res = await client.query("SELECT NOW() as time, current_database() as db");
        const queryLatency = Date.now() - queryStart;
        
        await client.end();
        
        result.tests.rawConnection = {
            success: true,
            connectLatencyMs: connectLatency,
            queryLatencyMs: queryLatency,
            totalLatencyMs: connectLatency + queryLatency,
            serverTime: res.rows[0]?.time,
            database: res.rows[0]?.db,
        };
    } catch (error) {
        result.tests.rawConnection = {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }

    // Test 2: Product query using products.server.ts helper
    try {
        const startTime = Date.now();
        const products = await getProductsFromDB(context as any, { limit: 3 });
        const latency = Date.now() - startTime;
        
        result.tests.productQuery = {
            success: true,
            latencyMs: latency,
            productCount: products.products.length,
            products: products.products.map(p => ({
                id: p.id,
                handle: p.handle,
                title: p.title,
            })),
        };
    } catch (error) {
        result.tests.productQuery = {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }

    // Test 3: Check product table structure
    try {
        const client = await getDbClient(context as any);
        const res = await client.query(`
            SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'product' 
            LIMIT 10
        `);
        await client.end();
        
        result.tests.tableStructure = {
            success: true,
            columns: res.rows,
        };
    } catch (error) {
        result.tests.tableStructure = {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }

    // Overall status
    const allTestsPassed = Object.values(result.tests as Record<string, any>).every(t => t.success);
    result.status = allTestsPassed ? "ok" : "error";

    return Response.json(result, {
        headers: {
            "Cache-Control": "no-store",
            "Content-Type": "application/json",
        },
    });
}

