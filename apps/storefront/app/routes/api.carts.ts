import { type ActionFunctionArgs, data } from "react-router";
import { medusaFetch } from "../lib/medusa-fetch";
import { MedusaCartService } from "../services/medusa-cart";
import { createLogger, getTraceIdFromRequest } from "../lib/logger";

interface CreateCartRequest {
  region_id?: string;
  currency?: string;
  country_code?: string;
}

/**
 * POST /api/carts
 * Create a new cart or validate an existing one
 */
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  const env = context.cloudflare.env as {
    MEDUSA_BACKEND_URL?: string;
    MEDUSA_PUBLISHABLE_KEY?: string;
  };

  const medusaBackendUrl = env.MEDUSA_BACKEND_URL || "http://localhost:9000";
  const medusaPublishableKey = env.MEDUSA_PUBLISHABLE_KEY;

  if (!medusaPublishableKey) {
    return data({ error: "Missing MEDUSA_PUBLISHABLE_KEY" }, { status: 500 });
  }

  let body: CreateCartRequest = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is OK, we'll use defaults
  }

  const { region_id, currency = "CAD", country_code } = body;

  const traceId = getTraceIdFromRequest(request);
  const logger = createLogger({ traceId, context: "api.carts" });

  try {
    // Fetch regions to find appropriate region
    const regionsResponse = await medusaFetch(`/store/regions`, {
      method: "GET",
      label: "medusa-regions",
      context,
    });

    if (!regionsResponse.ok) {
      logger.error("Failed to fetch regions", undefined, { status: regionsResponse.status });
      return data({ error: "Failed to fetch regions" }, { status: 500 });
    }

    const { regions } = await regionsResponse.json() as { regions: any[] };

    // Priority 0: Use explicit region_id if provided (from LocaleContext)
    let region = null;
    if (region_id) {
      region = regions.find((r: any) => r.id === region_id);
      if (region) {
        logger.info(`[api.carts] Using explicit region_id: "${region.name}" (${region_id})`);
      } else {
        logger.warn(`[api.carts] Provided region_id "${region_id}" not found, falling back`);
      }
    }

    // Priority 1: Find region by country code
    if (!region && country_code) {
      const code = country_code.toLowerCase();
      region = regions.find((r: any) =>
        r.countries?.some((c: any) =>
          c.iso_2?.toLowerCase() === code ||
          c.iso_3?.toLowerCase() === code
        )
      );
      if (region) {
        logger.info(`[api.carts] Found region "${region.name}" for country ${country_code}`);
      }
    }

    // Priority 2: Fall back to currency match
    if (!region) {
      region = regions.find((r: any) =>
        r.currency_code.toUpperCase() === currency.toUpperCase()
      );
      if (region) {
        logger.info(`[api.carts] Using region "${region.name}" based on currency ${currency}`);
      }
    }

    // Priority 3: Use first available region
    if (!region && regions.length > 0) {
      region = regions[0];
      logger.info(`[api.carts] Using fallback region "${region.name}"`);
    }

    if (!region) {
      return data({ error: "No valid region found" }, { status: 400 });
    }

    // Create cart with the selected region
    const service = new MedusaCartService(context);
    const cartId = await service.getOrCreateCart(region.id, currency);

    return data({
      cart_id: cartId,
      region_id: region.id,
      region_name: region.name,
      currency_code: region.currency_code,
    }, { status: 201 });

  } catch (error: any) {
    logger.error("Error creating cart", error);
    return data({
      error: "Failed to create cart",
      details: error.message,
    }, { status: 500 });
  }
}
