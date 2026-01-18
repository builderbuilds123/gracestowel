import "dotenv/config";

const MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";
const PUBLISHABLE_KEY = process.env.MEDUSA_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  console.error("Error: MEDUSA_PUBLISHABLE_KEY is required in .env");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  "x-publishable-api-key": PUBLISHABLE_KEY,
};

async function run() {
  console.log("🚀 Starting Promotion Flow Verification...");
  console.log(`Backend: ${MEDUSA_BACKEND_URL}`);

  try {
    // 1. Fetching Products...
    console.log("\n1. Fetching Products...");
    const productsRes = await fetch(`${MEDUSA_BACKEND_URL}/store/products`, { headers });
    const products = await productsRes.json();
    
    if (!products.products || products.products.length === 0) {
      throw new Error("No products found. Seed db first.");
    }
    
    const product = products.products[0];
    const variantId = product.variants[0].id;
    console.log(`   Found product: ${product.title} (${product.id})`);

    // 1b. Fetch Regions
    console.log("\n1b. Fetching Regions...");
    const regionsRes = await fetch(`${MEDUSA_BACKEND_URL}/store/regions`, { headers });
    const regions = await regionsRes.json();
    const region = regions.regions?.[0];
    
    if (!region) throw new Error("No regions found.");
    console.log(`   Using Region: ${region.name} (${region.id})`);

    // 2. Create Cart
    console.log("\n2. Creating Cart...");
    const cartRes = await fetch(`${MEDUSA_BACKEND_URL}/store/carts`, {
      method: "POST",
      headers,
      body: JSON.stringify({ 
          region_id: region.id
      }), 
    });
    
    if (!cartRes.ok) {
        const err = await cartRes.text();
        throw new Error(`Failed to create cart: ${cartRes.status} ${err}`);
    }

    const { cart } = await cartRes.json();
    console.log(`   Cart created: ${cart.id} (Region: ${cart.region?.id || 'auto'})`);

    // 3. Add Line Item
    console.log("\n3. Adding Item to Cart...");
    const lineItemRes = await fetch(`${MEDUSA_BACKEND_URL}/store/carts/${cart.id}/line-items`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        variant_id: variantId,
        quantity: 1,
      }),
    });

    if (!lineItemRes.ok) {
        const err = await lineItemRes.text();
        throw new Error(`Failed to add item: ${lineItemRes.status} ${err}`);
    }
    console.log("   Item added.");

    // 4. Apply Promo Code
    console.log("\n4. Applying 'TEST10' Promo Code...");
    const promoRes = await fetch(`${MEDUSA_BACKEND_URL}/store/carts/${cart.id}/promotions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        promo_codes: ["TEST10"],
      }),
    });

    if (!promoRes.ok) {
         const err = await promoRes.text();
         throw new Error(`Failed to apply promo: ${promoRes.status} ${err}`);
    }
    console.log("   Promo code applied.");

    // 5. Verify Discount
    console.log("\n5. Verifying Totals...");
    const finalCartRes = await fetch(`${MEDUSA_BACKEND_URL}/store/carts/${cart.id}`, { headers });
    const finalCart = (await finalCartRes.json()).cart;

    // In Medusa v2, discount_total might be computed properties or adjustments
    // We check if promotions array is populated or adjustments exist
    console.log(`   Subtotal: ${finalCart.subtotal}`);
    console.log(`   Discount Total: ${finalCart.discount_total}`);
    console.log(`   Total: ${finalCart.total}`);
    
    // Check if promotions explicitly linked
    // Depending on API response shape
    
    if (finalCart.discount_total > 0) {
        console.log("✅ SUCCESS: Discount was applied!");
    } else {
        console.error("❌ FAILURE: Discount total is 0.");
        process.exit(1);
    }
    
  } catch (e) {
    console.error("❌ Verified Failed:", e);
    process.exit(1);
  }
}

run();
