import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

/**
 * Script to add prices to existing product variants that are missing prices.
 * 
 * Run with: npx medusa exec ./src/scripts/fix-product-prices.ts
 */
export default async function fixProductPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const pricingModuleService = container.resolve(Modules.PRICING);
  const regionModuleService = container.resolve(Modules.REGION);

  logger.info("Starting to fix product prices...");

  // Get all regions to map currencies
  const regions = await regionModuleService.listRegions({});
  logger.info(`Found ${regions.length} regions: ${regions.map(r => r.name).join(", ")}`);

  // Price definitions for each product (in dollars)
  const productPrices: Record<string, { usd: number; eur: number; cad: number }> = {
    "the-nuzzle": { usd: 18, eur: 16, cad: 24 },
    "the-cradle": { usd: 25, eur: 22, cad: 34 },
    "the-bearhug": { usd: 35, eur: 30, cad: 48 },
    "the-wool-dryer-ball": { usd: 18, eur: 16, cad: 24 },
  };

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "variants.id",
      "variants.sku",
      "variants.title",
      "variants.prices.amount",
      "variants.prices.currency_code",
      "variants.prices.price_set_id",
    ],
    filters: { handle: Object.keys(productPrices) },
  });

  logger.info(`Found ${products.length} products to check`);

  let updatedCount = 0;

  for (const product of products as Array<{
    id: string;
    handle: string;
    variants?: Array<{
      id: string;
      sku?: string | null;
      title?: string | null;
      prices?: Array<{ amount?: number | null; currency_code?: string | null; price_set_id?: string | null }> | null;
    }>;
  }>) {
    const handle = product.handle;
    const priceConfig = productPrices[handle as keyof typeof productPrices];

    if (!priceConfig) {
      logger.warn(`No price config found for product: ${handle}`);
      continue;
    }

    for (const variant of product.variants || []) {
      // Check if variant has prices
      const existingPrices = variant.prices || [];

      const currenciesNeeded = ["usd", "eur", "cad"];
      const existingCurrencyCodes = new Set(
        existingPrices
          .filter((price) => typeof price.amount === "number" && price.amount > 0)
          .map((price) => (price.currency_code || "").toLowerCase())
          .filter(Boolean)
      );
      const missingCurrencies = currenciesNeeded.filter(
        (currency) => !existingCurrencyCodes.has(currency)
      );

      if (missingCurrencies.length === 0) {
        logger.info(`Variant ${variant.sku} already has ${existingPrices.length} prices, skipping`);
        continue;
      }

      logger.info(`Adding prices to variant: ${variant.sku} (${variant.title})`);

      const priceSetId = existingPrices.find((price) => price.price_set_id)?.price_set_id || null;
      const pricesToAdd = missingCurrencies.map((currency) => {
        const amount = currency === "usd"
          ? priceConfig.usd
          : currency === "eur"
            ? priceConfig.eur
            : priceConfig.cad;
        return { amount, currency_code: currency };
      });

      try {
        if (priceSetId) {
          await pricingModuleService.updatePriceSets(priceSetId, {
            prices: pricesToAdd,
          });
          logger.info(`  ✓ Added missing prices for ${variant.sku} on existing price set.`);
          updatedCount++;
          continue;
        }

        // Create price set for the variant
        const priceSet = await pricingModuleService.createPriceSets([
          {
            prices: [
              { amount: priceConfig.usd, currency_code: "usd" },
              { amount: priceConfig.eur, currency_code: "eur" },
              { amount: priceConfig.cad, currency_code: "cad" },
            ],
          },
        ]);

        if (priceSet && priceSet[0]) {
          // Link the price set to the variant using the remote link
          const link = container.resolve(ContainerRegistrationKeys.LINK);
          await link.create({
            [Modules.PRODUCT]: { variant_id: variant.id },
            [Modules.PRICING]: { price_set_id: priceSet[0].id },
          });

          logger.info(`  ✓ Added prices for ${variant.sku}: $${priceConfig.usd} USD, €${priceConfig.eur} EUR, $${priceConfig.cad} CAD`);
          updatedCount++;
        }
      } catch (error: any) {
        logger.error(`  ✗ Failed to add prices for ${variant.sku}: ${error.message}`);
      }
    }
  }

  logger.info(`\nFinished! Updated ${updatedCount} variants with prices.`);
  
  if (updatedCount === 0) {
    logger.info("No variants needed price updates. If products still show $0, try:");
    logger.info("1. Check if variants are properly linked to price sets");
    logger.info("2. Run: npx medusa db:sync-links");
    logger.info("3. Or re-seed the database: npx medusa db:seed");
  }
}
