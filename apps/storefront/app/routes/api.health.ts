import type { LoaderFunctionArgs } from "react-router";
import { getMedusaClient } from "~/lib/medusa";

/**
 * Health check endpoint that verifies:
 * 1. Worker is running
 * 2. Connection to Medusa backend API is working
 */
export async function loader({ context }: LoaderFunctionArgs) {
    const env = (context as any)?.cloudflare?.env;

    const health: Record<string, unknown> = {
        status: "ok",
        timestamp: new Date().toISOString(),
        environment: import.meta.env.MODE || "unknown",
        medusaUrl: env?.MEDUSA_BACKEND_URL || import.meta.env.VITE_MEDUSA_BACKEND_URL || "not configured",
    };

    // Test Medusa API connection
    try {
        const medusa = getMedusaClient(context as any);
        const startTime = Date.now();
        const { products, count, limit, offset } = await medusa.store.product.list({ limit: 1 });
        const latency = Date.now() - startTime;

        health.medusa = {
            connected: true,
            latency: `${latency}ms`,
            productCount: count || products?.length || 0,
        };
    } catch (error) {
        health.medusa = {
            connected: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
        health.status = "degraded";
    }

    return Response.json(health, {
        headers: {
            "Cache-Control": "no-store",
        },
    });
}

