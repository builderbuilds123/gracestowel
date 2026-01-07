import { CreateInventoryLevelInput, ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresStep,
  updateStoresWorkflow,
} from "@medusajs/core-flows";
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

const updateStoreCurrencies = createWorkflow(
  "update-store-currencies",
  (input: {
    supported_currencies: { currency_code: string; is_default?: boolean }[];
    store_id: string;
  }) => {
    const normalizedInput = transform({ input }, (data) => {
      return {
        selector: { id: data.input.store_id },
        update: {
          supported_currencies: data.input.supported_currencies.map(
            (currency) => {
              return {
                currency_code: currency.currency_code,
                is_default: currency.is_default ?? false,
              };
            }
          ),
        },
      };
    });

    const stores = updateStoresStep(normalizedInput);

    return new WorkflowResponse(stores);
  }
);

export default async function seedDemoData({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const storeModuleService = container.resolve(Modules.STORE);
  const regionModuleService = container.resolve(Modules.REGION);
  const taxModuleService = container.resolve(Modules.TAX);
  const stockLocationModuleService = container.resolve(Modules.STOCK_LOCATION);

  // Grace Stowel ships to US, Canada, and select European countries
  const countries = ["us", "ca", "gb", "de", "dk", "se", "fr", "es", "it"];

  logger.info("Seeding store data...");
  const [store] = await storeModuleService.listStores();
  let defaultSalesChannel = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  });

  if (!defaultSalesChannel.length) {
    // create the default sales channel
    const { result: salesChannelResult } = await createSalesChannelsWorkflow(
      container
    ).run({
      input: {
        salesChannelsData: [
          {
            name: "Default Sales Channel",
          },
        ],
      },
    });
    defaultSalesChannel = salesChannelResult;
  }

  await updateStoreCurrencies(container).run({
    input: {
      store_id: store.id,
      supported_currencies: [
        {
          currency_code: "cad",
          is_default: true,
        },
        {
          currency_code: "usd",
        },
        {
          currency_code: "eur",
        },
      ],
    },
  });

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        default_sales_channel_id: defaultSalesChannel[0].id,
      },
    },
  });
  
  logger.info("Seeding region data...");
  // Check if regions already exist to make seed idempotent
  const existingRegions = await regionModuleService.listRegions({});
  const existingRegionNames = new Set(existingRegions.map((r) => r.name));
  
  const regionsToCreate = [
    {
      name: "Canada",
      currency_code: "cad",
      countries: ["CA"],
      payment_providers: ["pp_system_default"],
    },
    {
      name: "United States",
      currency_code: "usd",
      countries: ["US"],
      payment_providers: ["pp_system_default"],
    },
    {
      name: "Europe",
      currency_code: "eur",
      countries: ["GB", "DE", "DK", "SE", "FR", "ES", "IT"],
      payment_providers: ["pp_system_default"],
    },
  ].filter((region) => !existingRegionNames.has(region.name));

  let regionCA, regionUS, regionEU;
  
  if (regionsToCreate.length > 0) {
    const { result: regionResult } = await createRegionsWorkflow(container).run({
      input: {
        regions: regionsToCreate,
      },
    });
    
    // Map created regions to variables
    for (const region of regionResult) {
      if (region.name === "Canada") regionCA = region;
      else if (region.name === "United States") regionUS = region;
      else if (region.name === "Europe") regionEU = region;
    }
    
    // If some regions already existed, fetch them
    if (!regionCA || !regionUS || !regionEU) {
      const allRegions = await regionModuleService.listRegions({});
      regionCA = allRegions.find((r) => r.name === "Canada");
      regionUS = allRegions.find((r) => r.name === "United States");
      regionEU = allRegions.find((r) => r.name === "Europe");
    }
  } else {
    // All regions already exist, fetch them
    regionCA = existingRegions.find((r) => r.name === "Canada");
    regionUS = existingRegions.find((r) => r.name === "United States");
    regionEU = existingRegions.find((r) => r.name === "Europe");
  }
  
  logger.info("Finished seeding regions.");
  
  if (regionUS || regionCA || regionEU) {
    const links = [];
    if (regionUS) links.push({ [Modules.REGION]: { region_id: regionUS.id }, [Modules.SALES_CHANNEL]: { sales_channel_id: defaultSalesChannel[0].id } });
    if (regionCA) links.push({ [Modules.REGION]: { region_id: regionCA.id }, [Modules.SALES_CHANNEL]: { sales_channel_id: defaultSalesChannel[0].id } });
    if (regionEU) links.push({ [Modules.REGION]: { region_id: regionEU.id }, [Modules.SALES_CHANNEL]: { sales_channel_id: defaultSalesChannel[0].id } });
    
    await link.create(links);
    logger.info("Linked regions to Default Sales Channel.");
  }

  logger.info("Seeding tax regions...");
  // Check if tax regions already exist to make seed idempotent
  const existingTaxRegions = await taxModuleService.listTaxRegions({});
  const existingTaxRegionCountries = new Set(
    existingTaxRegions.map((tr) => tr.country_code?.toLowerCase())
  );
  
  const taxRegionsToCreate = countries
    .map((country_code) => ({
      country_code,
      provider_id: "tp_system",
    }))
    .filter((tr) => !existingTaxRegionCountries.has(tr.country_code.toLowerCase()));
  
  if (taxRegionsToCreate.length > 0) {
    await createTaxRegionsWorkflow(container).run({
      input: taxRegionsToCreate,
    });
  }
  logger.info("Finished seeding tax regions.");

  logger.info("Seeding stock location data...");

  // Check if stock location already exists to make seed idempotent
  const existingStockLocations = await stockLocationModuleService.listStockLocations({
    name: "Grace Stowel Warehouse",
  });

  let stockLocation;
  let stockLocationCreated = false;
  if (existingStockLocations.length > 0) {
    stockLocation = existingStockLocations[0];
    logger.info("Using existing stock location: Grace Stowel Warehouse");
  } else {
    const { result: stockLocationResult } = await createStockLocationsWorkflow(
      container
    ).run({
      input: {
        locations: [
          {
            name: "Grace Stowel Warehouse",
            address: {
              city: "Los Angeles",
              country_code: "US",
              address_1: "",
            },
          },
        ],
      },
    });
    stockLocation = stockLocationResult[0];
    stockLocationCreated = true;
    logger.info("Created stock location: Grace Stowel Warehouse");
  }

  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        default_location_id: stockLocation.id,
      },
    },
  });

  // Only create link if stock location was just created (link would already exist otherwise)
  if (stockLocationCreated) {
    await link.create({
      [Modules.STOCK_LOCATION]: {
        stock_location_id: stockLocation.id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_provider_id: "manual_manual",
      },
    });
  }

  logger.info("Seeding fulfillment data...");
  const shippingProfiles = await fulfillmentModuleService.listShippingProfiles({
    type: "default",
  });
  let shippingProfile = shippingProfiles.length ? shippingProfiles[0] : null;

  if (!shippingProfile) {
    const { result: shippingProfileResult } =
      await createShippingProfilesWorkflow(container).run({
        input: {
          data: [
            {
              name: "Default Shipping Profile",
              type: "default",
            },
          ],
        },
      });
    shippingProfile = (shippingProfileResult as any[])[0];
  }

  if (!shippingProfile) {
    throw new Error("Failed to create or find default shipping profile");
  }

  // Check if fulfillment set already exists to make seed idempotent
  const existingFulfillmentSets = await fulfillmentModuleService.listFulfillmentSets({
    name: "Grace Stowel Global Delivery",
  });

  let fulfillmentSet;
  let fulfillmentSetCreated = false;
  if (existingFulfillmentSets.length > 0) {
    fulfillmentSet = existingFulfillmentSets[0];
    logger.info("Using existing fulfillment set: Grace Stowel Global Delivery");
  } else {
    fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets({
      name: "Grace Stowel Global Delivery",
      type: "shipping",
      service_zones: [
        {
          name: "North America",
          geo_zones: [
            {
              country_code: "us",
              type: "country",
            },
            {
              country_code: "ca",
              type: "country",
            },
          ],
        },
        {
          name: "Europe",
          geo_zones: [
            {
              country_code: "gb",
              type: "country",
            },
            {
              country_code: "de",
              type: "country",
            },
            {
              country_code: "dk",
              type: "country",
            },
            {
              country_code: "se",
              type: "country",
            },
            {
              country_code: "fr",
              type: "country",
            },
            {
              country_code: "es",
              type: "country",
            },
            {
              country_code: "it",
              type: "country",
            },
          ],
        },
      ],
    });
    fulfillmentSetCreated = true;
    logger.info("Created fulfillment set: Grace Stowel Global Delivery");
  }

  // Only create link if fulfillment set was just created (link would already exist otherwise)
  if (fulfillmentSetCreated) {
    await link.create({
      [Modules.STOCK_LOCATION]: {
        stock_location_id: stockLocation.id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_set_id: fulfillmentSet.id,
      },
    });
  }

  // Create shipping options for North America zone
  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Standard Shipping (3-5 days)",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id, // North America
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Delivery in 3-5 business days. Free on orders $99+",
          code: "standard",
        },
        prices: [
          {
            currency_code: "usd",
            amount: 8.95,
          },
          {
            region_id: regionUS.id,
            amount: 8.95,
          },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
      {
        name: "Express Shipping (1-2 days)",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id, // North America
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Express",
          description: "Delivery in 1-2 business days.",
          code: "express",
        },
        prices: [
          {
            currency_code: "usd",
            amount: 14.95,
          },
          {
            region_id: regionUS.id,
            amount: 14.95,
          },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
      // Europe shipping options
      {
        name: "Standard Shipping (5-7 days)",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[1].id, // Europe
        shipping_profile_id: shippingProfile.id,
        type: {
          label: "Standard",
          description: "Delivery in 5-7 business days.",
          code: "standard-eu",
        },
        prices: [
          {
            currency_code: "eur",
            amount: 12.95,
          },
          {
            region_id: regionEU.id,
            amount: 12.95,
          },
        ],
        rules: [
          {
            attribute: "enabled_in_store",
            value: "true",
            operator: "eq",
          },
          {
            attribute: "is_return",
            value: "false",
            operator: "eq",
          },
        ],
      },
    ],
  });
  logger.info("Finished seeding fulfillment data.");

  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: {
      id: stockLocation.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("Finished seeding stock location data.");

  logger.info("Seeding publishable API key data...");
  const { result: publishableApiKeyResult } = await createApiKeysWorkflow(
    container
  ).run({
    input: {
      api_keys: [
        {
          title: "Webshop",
          type: "publishable",
          created_by: "",
        },
      ],
    },
  });
  const publishableApiKey = publishableApiKeyResult[0];

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableApiKey.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("Finished seeding publishable API key data.");

  logger.info("Seeding product data...");

  const categories = [
    { name: "Bath Towels", is_active: true },
    { name: "Hand Towels", is_active: true },
    { name: "Washcloths", is_active: true },
    { name: "Accessories", is_active: true },
  ];

  const { result: categoryResult } = await createProductCategoriesWorkflow(container).run({
    input: {
      product_categories: categories,
    },
  });

  await createProductsWorkflow(container).run({
    input: {
      products: [
        // The Nuzzle - Washcloth
        {
          title: "The Nuzzle",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Washcloths")!.id,
          ],
          description:
            "Our signature washcloth. Gentle enough for a baby, durable enough for daily use. The Nuzzle is woven from 100% long-staple cotton for superior absorbency and softness.",
          handle: "the-nuzzle",
          weight: 100,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            { url: "/washcloth-nuzzle.jpg" },
          ],
          metadata: {
            dimensions: '13" x 13"',
            features: JSON.stringify([
              "100% Long-Staple Cotton",
              "Perfect Face Cloth Size",
              "Oeko-Tex Certified",
              "Made in Portugal"
            ]),
            care_instructions: JSON.stringify([
              "Machine wash warm",
              "Tumble dry low",
              "Do not bleach",
              "Avoid fabric softeners"
            ]),
          },
          options: [
            {
              title: "Color",
              values: ["Cloud White", "Sage", "Terra Cotta"],
            },
          ],
          variants: [
            {
              title: "Cloud White",
              sku: "NUZZLE-WHITE",
              options: { Color: "Cloud White" },
              prices: [
                { amount: 16, currency_code: "eur" },
                { amount: 18, currency_code: "usd" },
                { amount: 24, currency_code: "cad" },
              ],
            },
            {
              title: "Sage",
              sku: "NUZZLE-SAGE",
              options: { Color: "Sage" },
              prices: [
                { amount: 16, currency_code: "eur" },
                { amount: 18, currency_code: "usd" },
                { amount: 24, currency_code: "cad" },
              ],
            },
            {
              title: "Terra Cotta",
              sku: "NUZZLE-TERRACOTTA",
              options: { Color: "Terra Cotta" },
              prices: [
                { amount: 16, currency_code: "eur" },
                { amount: 18, currency_code: "usd" },
                { amount: 24, currency_code: "cad" },
              ],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },
        // The Cradle - Hand Towel
        {
          title: "The Cradle",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Hand Towels")!.id,
          ],
          description:
            "The perfect hand towel. Soft, absorbent, and ready to comfort your hands after every wash. Designed to add a touch of luxury to your powder room.",
          handle: "the-cradle",
          weight: 200,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            { url: "/hand-towel-cradle.jpg" },
          ],
          metadata: {
            dimensions: '20" x 30"',
            features: JSON.stringify([
              "High Absorbency",
              "Quick Drying",
              "Double-Stitched Hems",
              "Sustainably Sourced"
            ]),
            care_instructions: JSON.stringify([
              "Machine wash warm",
              "Tumble dry low",
              "Do not bleach",
              "Avoid fabric softeners"
            ]),
          },
          options: [
            {
              title: "Color",
              values: ["Cloud White", "Charcoal", "Navy"],
            },
          ],
          variants: [
            {
              title: "Cloud White",
              sku: "CRADLE-WHITE",
              options: { Color: "Cloud White" },
              prices: [
                { amount: 22, currency_code: "eur" },
                { amount: 25, currency_code: "usd" },
                { amount: 34, currency_code: "cad" },
              ],
            },
            {
              title: "Charcoal",
              sku: "CRADLE-CHARCOAL",
              options: { Color: "Charcoal" },
              prices: [
                { amount: 22, currency_code: "eur" },
                { amount: 25, currency_code: "usd" },
                { amount: 34, currency_code: "cad" },
              ],
            },
            {
              title: "Navy",
              sku: "CRADLE-NAVY",
              options: { Color: "Navy" },
              prices: [
                { amount: 22, currency_code: "eur" },
                { amount: 25, currency_code: "usd" },
                { amount: 34, currency_code: "cad" },
              ],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },
        // The Bear Hug - Bath Towel
        {
          title: "The Bear Hug",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Bath Towels")!.id,
          ],
          description:
            "Wrap yourself in a warm embrace with our oversized, ultra-plush bath towel. The Bear Hug provides maximum coverage and maximum comfort for your post-bath ritual.",
          handle: "the-bearhug",
          weight: 700,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            { url: "/bath-towel-bearhug.jpg" },
            { url: "/white_bathtowel_laidout_product.png" },
            { url: "/white_bathtowel_folded_product.png" },
          ],
          metadata: {
            dimensions: '30" x 58"',
            features: JSON.stringify([
              "Oversized for Comfort",
              "700 GSM Weight",
              "Cloud-like Softness",
              "Fade Resistant"
            ]),
            care_instructions: JSON.stringify([
              "Machine wash warm",
              "Tumble dry low",
              "Do not bleach",
              "Avoid fabric softeners"
            ]),
          },
          options: [
            {
              title: "Color",
              values: ["Cloud White", "Sand", "Stone"],
            },
          ],
          variants: [
            {
              title: "Cloud White",
              sku: "BEARHUG-WHITE",
              options: { Color: "Cloud White" },
              prices: [
                { amount: 30, currency_code: "eur" },
                { amount: 35, currency_code: "usd" },
                { amount: 48, currency_code: "cad" },
              ],
            },
            {
              title: "Sand",
              sku: "BEARHUG-SAND",
              options: { Color: "Sand" },
              prices: [
                { amount: 30, currency_code: "eur" },
                { amount: 35, currency_code: "usd" },
                { amount: 48, currency_code: "cad" },
              ],
            },
            {
              title: "Stone",
              sku: "BEARHUG-STONE",
              options: { Color: "Stone" },
              prices: [
                { amount: 30, currency_code: "eur" },
                { amount: 35, currency_code: "usd" },
                { amount: 48, currency_code: "cad" },
              ],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },
        // Wool Dryer Balls - Accessory
        {
          title: "3 Wool Dryer Balls",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Accessories")!.id,
          ],
          description:
            "Reduce drying time and soften fabrics naturally. Comes with 3 balls. Our 100% New Zealand wool dryer balls are the eco-friendly alternative to dryer sheets.",
          handle: "the-wool-dryer-ball",
          weight: 150,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            { url: "/wood_dryer_balls.png" },
          ],
          metadata: {
            dimensions: '3" Diameter',
            features: JSON.stringify([
              "100% New Zealand Wool",
              "Reduces Drying Time",
              "Hypoallergenic",
              "Lasts for 1000+ Loads"
            ]),
            care_instructions: JSON.stringify([
              "Store in a dry place",
              "Recharge in sun monthly"
            ]),
            disable_embroidery: "true",
          },
          options: [
            {
              title: "Type",
              values: ["Natural"],
            },
          ],
          variants: [
            {
              title: "Natural",
              sku: "DRYER-BALLS-3",
              options: { Type: "Natural" },
              prices: [
                { amount: 16, currency_code: "eur" },
                { amount: 18, currency_code: "usd" },
                { amount: 24, currency_code: "cad" },
              ],
            },
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }],
        },
      ],
    },
  });
  logger.info("Finished seeding product data.");

  logger.info("Seeding inventory levels.");

  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  });

  const inventoryLevels: CreateInventoryLevelInput[] = [];
  for (const inventoryItem of inventoryItems) {
    const inventoryLevel = {
      location_id: stockLocation.id,
      stocked_quantity: 100, // Start with 100 units per variant
      inventory_item_id: inventoryItem.id,
    };
    inventoryLevels.push(inventoryLevel);
  }

  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: inventoryLevels,
    },
  });

  logger.info("Finished seeding inventory levels data.");
}
