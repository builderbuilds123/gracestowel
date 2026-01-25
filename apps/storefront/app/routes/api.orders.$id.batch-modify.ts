import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { medusaFetch } from "../lib/medusa-fetch";
import { createLogger } from "../lib/logger";

/**
 * API endpoint for batch order modifications.
 * Proxies requests to the backend batch-modifications endpoint.
 *
 * POST /api/orders/:id/batch-modify
 *
 * Body:
 * {
 *   items: Array<{
 *     action: 'add' | 'remove' | 'update_quantity';
 *     variant_id: string;
 *     quantity: number;
 *   }>
 * }
 *
 * Headers:
 * - x-modification-token: JWT modification token (required)
 */
export async function action({ params, request, context }: ActionFunctionArgs) {
    const logger = createLogger({ context: "api.orders.batch-modify" });
    const { id: orderId } = params;

    if (request.method !== "POST") {
        return data({ error: "Method not allowed" }, { status: 405 });
    }

    const modificationToken = request.headers.get("x-modification-token");
    if (!modificationToken) {
        return data({ error: "Modification token is required", code: "TOKEN_REQUIRED" }, { status: 401 });
    }

    try {
        const body = await request.json() as {
            items: Array<{
                action: string;
                variant_id: string;
                quantity: number;
            }>;
        };

        logger.info("Batch modify request received", {
            orderId,
            itemCount: body.items?.length || 0,
        });

        // Validate request body
        if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
            return data({ error: "Items array is required and cannot be empty", code: "INVALID_INPUT" }, { status: 400 });
        }

        // Proxy to backend batch-modifications endpoint
        const response = await medusaFetch(`/store/orders/${orderId}/batch-modifications`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-modification-token": modificationToken,
            },
            body: JSON.stringify(body),
            label: "order-batch-modify",
            context,
        });

        const responseData = await response.json() as {
            message?: string;
            code?: string;
            order?: unknown;
            items_added?: number;
        };

        if (!response.ok) {
            logger.error("Batch modify failed", new Error(responseData.message || "Unknown error"), {
                orderId,
                status: response.status,
                code: responseData.code,
            });

            return data(responseData, { status: response.status });
        }

        logger.info("Batch modify succeeded", {
            orderId,
            itemCount: body.items.length,
        });

        return data(responseData, { status: 200 });
    } catch (error) {
        logger.error("Batch modify error", error instanceof Error ? error : new Error(String(error)), {
            orderId,
        });

        return data(
            { error: "Failed to process batch modification", code: "INTERNAL_ERROR" },
            { status: 500 }
        );
    }
}
