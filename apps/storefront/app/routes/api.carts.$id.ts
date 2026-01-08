import { type ActionFunctionArgs, type LoaderFunctionArgs, data } from "react-router";
import { MedusaCartService } from "../services/medusa-cart";
import type { CartItem } from "../types/product";
import { isMedusaId } from "../types/product";

interface UpdateCartRequest {
  items?: CartItem[];
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

  const { items, shipping_address } = body;

  if (!items && !shipping_address) {
    return data({ error: "At least one of 'items' or 'shipping_address' is required" }, { status: 400 });
  }

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
    } = { success: true };

    // Sync items if provided
    if (items && items.length > 0) {
      // Log incoming items for debugging
      console.log(`[Cart Sync] Received ${items.length} items:`, items.map(i => ({ 
        id: i.id, 
        variantId: i.variantId, 
        title: i.title,
        isValidMedusaId: i.variantId ? isMedusaId(i.variantId) : false 
      })));
      
      const validItems = items.filter(item => item.variantId && isMedusaId(item.variantId));
      
      if (validItems.length !== items.length) {
        console.warn(`[Cart Sync] Filtered out ${items.length - validItems.length} items with invalid variantIds`);
      }
      
      await service.syncCartItems(cartId, validItems);
      result.items_synced = validItems.length;
      console.log(`Synced ${validItems.length} items to cart ${cartId}`);
    }

    // Update shipping address if provided
    if (shipping_address) {
      await service.updateShippingAddress(cartId, shipping_address);
      result.address_updated = true;
      console.log(`Updated shipping address for cart ${cartId}`);
    }

    return data(result, { status: 200 });

  } catch (error: any) {
    console.error(`Error updating cart ${cartId}:`, error);
    
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
export async function loader({ params, context }: LoaderFunctionArgs) {
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

    return data({
      id: cart.id,
      region_id: cart.region_id,
      items: cart.items,
      shipping_address: cart.shipping_address,
    });

  } catch (error: any) {
    console.error(`Error fetching cart ${cartId}:`, error);
    return data({
      error: "Failed to fetch cart",
      details: error.message,
    }, { status: 500 });
  }
}
