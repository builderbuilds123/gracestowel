import { type ActionFunctionArgs, type LoaderFunctionArgs, data } from "react-router";
import { MedusaCartService, type Cart } from "../services/medusa-cart";
import type { CartItem } from "../types/product";
import { isMedusaId } from "../types/product";
import { createLogger, getTraceIdFromRequest } from "../lib/logger";

interface UpdateCartRequest {
  items?: CartItem[];
  promo_codes?: string[];
  shipping_address?: {
    first_name: string;
    last_name: string;
    address_1: string;
    address_2?: string;
    city: string;
    country_code: string;
    postal_code: string;
    province?: string;
    phone?: string;
  };
  billing_address?: Partial<{
    first_name: string;
    last_name: string;
    address_1: string;
    address_2?: string;
    city: string;
    country_code: string;
    postal_code: string;
    province?: string;
    phone?: string;
  }>;
  email?: string;
  region_id?: string;
  sales_channel_id?: string;
  metadata?: Record<string, any>;
}

/**
 * PATCH /api/carts/:id
 * Update cart items and/or shipping address
 */
export async function action({ request, params, context }: ActionFunctionArgs) {
  if (request.method !== "PATCH") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }

  const cartId = params.id;
  if (!cartId) {
    return data({ error: "Cart ID is required" }, { status: 400 });
  }

  let body: UpdateCartRequest;
  try {
    body = await request.json();
  } catch {
    return data({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { items, promo_codes, shipping_address, billing_address, email, region_id, sales_channel_id, metadata } = body;

  if (!items && !promo_codes && !shipping_address && !billing_address && !email && !region_id && !sales_channel_id && !metadata) {
    return data({ error: "No update fields provided" }, { status: 400 });
  }

  const traceId = getTraceIdFromRequest(request);
  const logger = createLogger({ traceId, context: "api.carts.$id" });
  const service = new MedusaCartService(context);

  try {
    // Verify cart exists
    const cart = await service.getCart(cartId);
    if (!cart) {
      return data({ error: "Cart not found" }, { status: 404 });
    }

    const result: {
      success: boolean;
      items_synced?: number;
      address_updated?: boolean;
      cart?: Cart | null;
    } = { success: true };

    // Update region first if provided to ensure pricing context for line items
    if (region_id) {
      await service.updateCart(cartId, { region_id });
    }

    // Sync items if provided
    if (items && items.length > 0) {
      // Log incoming items for debugging
      logger.info(`[Cart Sync] Received ${items.length} items`, { 
        items: items.map(i => ({ 
          id: i.id, 
          variantId: i.variantId, 
          title: i.title,
          isValidMedusaId: i.variantId ? isMedusaId(i.variantId) : false 
        }))
      });
      
      const validItems = items.filter(item => {
        const hasId = !!(item.variantId || item.id);
        const isMedusa = isMedusaId(item.variantId || item.id);
        return hasId && isMedusa && item.quantity > 0;
      });
      
      if (validItems.length !== items.length) {
        const invalid = items.filter(i => !validItems.includes(i));
        logger.warn(`[Cart Sync] Filtered out ${items.length - validItems.length} items`, {
          reasons: invalid.map(i => ({ title: i.title, id: i.id, variantId: i.variantId }))
        });
      }
      
      try {
        await service.syncCartItems(cartId, validItems);
        result.items_synced = validItems.length;
        logger.info(`Synced ${validItems.length} items to cart ${cartId}`);
      } catch (syncError: any) {
        logger.error("Cart sync failed", syncError);
        // Check for inventory errors
        if (syncError.message?.includes("inventory") || syncError.type === "not_allowed") {
           return data({ 
             error: "Some items are out of stock", 
             details: syncError.message,
             code: "INVENTORY_ERROR"
           }, { status: 422 });
        }
        throw syncError; // Re-throw to be caught by outer handler
      }
    }

    // Update cart details
    if (shipping_address || billing_address || email || sales_channel_id || metadata || promo_codes) {
      const updateData: any = {};
      if (shipping_address)    updateData.shipping_address = shipping_address;
      if (billing_address)     updateData.billing_address = billing_address;
      if (email)               updateData.email = email;
      if (sales_channel_id)    updateData.sales_channel_id = sales_channel_id;
      if (metadata)            updateData.metadata = metadata;
      if (promo_codes)         updateData.promo_codes = promo_codes;
      
      await service.updateCart(cartId, updateData);
      if (shipping_address) result.address_updated = true;
      logger.info(`Updated cart ${cartId} properties`, { keys: Object.keys(updateData) });
    }

    const refreshedCart = await service.getCart(cartId);
    result.cart = refreshedCart || undefined;
    return data(result, { status: 200 });

  } catch (error: any) {
    logger.error(`Error updating cart ${cartId}`, error);
    
    // Determine status code from upstream error
    const status = error.status || 500;
    
    // Check for region mismatch error (broad text matching or 422 status with country/region keywords)
    const isRegionMismatch = 
      (error.message?.includes("Country") && error.message?.includes("not within region")) ||
      (status === 422 && error.message?.toLowerCase().includes("region"));

    if (isRegionMismatch) {
      return data({
        error: "Country not supported in cart region",
        details: error.message,
        code: "REGION_MISMATCH",
      }, { status: 400 }); // Return 400 so frontend can handle it
    }

    // Check for cart already completed error
    const isCartCompleted = error.message?.toLowerCase().includes('already completed');
    if (isCartCompleted) {
      return data({
        error: "Cart is already completed",
        details: error.message,
        code: "CART_COMPLETED",
      }, { status: 410 }); // 410 Gone - resource no longer available
    }

    // Forward upstream 4xx errors
    if (status >= 400 && status < 500) {
       return data({
        error: error.message || "Invalid request",
        details: error.details || undefined,
      }, { status });
    }

    return data({
      error: "Failed to update cart",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    }, { status: 502 }); // 502 indicates upstream (Medusa) failure
  }
}

/**
 * GET /api/carts/:id
 * Get cart details
 */
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const cartId = params.id;
  if (!cartId) {
    return data({ error: "Cart ID is required" }, { status: 400 });
  }

  const service = new MedusaCartService(context);

  try {
    const cart = await service.getCart(cartId);
    if (!cart) {
      return data({ error: "Cart not found" }, { status: 404 });
    }

    const traceId = getTraceIdFromRequest(request);
    const logger = createLogger({ traceId, context: "api.carts.$id.loader" });
    logger.info(`Fetched cart ${cartId}`, {
      id: cart.id,
      discount_total: (cart as any).discount_total,
      promotions: (cart as any).promotions?.map((p: any) => p.code),
      items_count: cart.items?.length
    });

    return data({
      id: cart.id,
      region_id: cart.region_id,
      items: cart.items,
      shipping_address: cart.shipping_address,
      discount_total: (cart as any).discount_total,
      promotions: (cart as any).promotions,
    });

  } catch (error: any) {
    const traceId = getTraceIdFromRequest(request);
    const logger = createLogger({ traceId, context: "api.carts.$id.loader" });
    logger.error(`Error fetching cart ${cartId}`, error);
    return data({
      error: "Failed to fetch cart",
      details: error.message,
    }, { status: 500 });
  }
}
