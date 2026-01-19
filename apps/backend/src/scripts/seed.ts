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
  const pricingModuleService = container.resolve(Modules.PRICING);

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
  
  logger.info("Seeding promotion data...");
  const promotionModuleService = container.resolve(Modules.PROMOTION);
  
  const existingPromotions = await promotionModuleService.listPromotions({
    code: "TEST10"
  });

  if (existingPromotions.length === 0) {
    try {
        await promotionModuleService.createPromotions({
        code: "TEST10",
        type: "standard",
        is_automatic: false,
        status: "active",
        application_method: {
            type: "percentage",
            target_type: "order",
            value: 10,
            // currency_code: "usd", // REMOVED: Should be currency agnostic for percentage
        },
        rules: [
            {
            attribute: "currency_code",
            operator: "eq",
            values: ["usd", "eur", "cad"],
            }
        ]
        });
        logger.info("Created promotion: TEST10 (10% OFF)");
    } catch (e) {
        logger.warn("Failed to create promotion TEST10: " + e.message);
    }
  } else {
    // Delete and recreate to ensure correct configuration (e.g. currency_code removal)
    try {
        await promotionModuleService.deletePromotions([existingPromotions[0].id]);
        
        await promotionModuleService.createPromotions({
            code: "TEST10",
            type: "standard",
            is_automatic: false,
            status: "active",
            application_method: {
                type: "percentage",
                target_type: "order",
                value: 10,
                // currency_code removed
            },
            rules: [
                {
                attribute: "currency_code",
                operator: "eq",
                values: ["usd", "eur", "cad"],
                }
            ]
        });
        logger.info("Recreated promotion: TEST10 (10% OFF)");
    } catch (e) {
        logger.warn("Failed to recreate promotion TEST10: " + e.message);
    }
  }
  logger.info("Finished seeding promotion data.");

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
    // FIXME: The direct Remote Link 'region' <-> 'sales_channel' is not defined in Medusa V2 standard links.
    // We cannot use link.create({ [Modules.REGION]: ..., [Modules.SALES_CHANNEL]: ... }) without a definition.
    // Ideally we'd use a workflow, but none exists for this specific link in default exports.
    // Proceeding without link; E2E tests may fail with 500s if context is invalid.
    
    const links: any[] = [];
    if (regionUS) links.push({ [Modules.REGION]: { id: regionUS.id }, [Modules.SALES_CHANNEL]: { id: defaultSalesChannel[0].id } });
    if (regionCA) links.push({ [Modules.REGION]: { id: regionCA.id }, [Modules.SALES_CHANNEL]: { id: defaultSalesChannel[0].id } });
    if (regionEU) links.push({ [Modules.REGION]: { id: regionEU.id }, [Modules.SALES_CHANNEL]: { id: defaultSalesChannel[0].id } });
    
    try {
        await link.create(links);
        logger.info("Linked Regions to Sales Channel");
    } catch (e) {
        logger.warn("Failed to link Regions to Sales Channel: " + e.message);
    }
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

  // Ensure service zones are available (refetch if necessary or use fallback logic)
  // Medusa v2 listFulfillmentSets might not expand relations by default
  // But createFulfillmentSets returns the created object with zones.
  // We need to handle the case where we fetched an existing one that might lack zones in the response.
  
  let serviceZoneNA = fulfillmentSet.service_zones?.find(z => z.name === "North America");
  let serviceZoneEU = fulfillmentSet.service_zones?.find(z => z.name === "Europe");

  // Refetch if zones are missing but set exists
  if (!serviceZoneNA || !serviceZoneEU) {
      const detailedSet = await fulfillmentModuleService.retrieveFulfillmentSet(fulfillmentSet.id, {
          relations: ["service_zones", "service_zones.geo_zones"]
      });
      serviceZoneNA = detailedSet.service_zones.find(z => z.name === "North America");
      serviceZoneEU = detailedSet.service_zones.find(z => z.name === "Europe");
  }

  if (!serviceZoneNA || !serviceZoneEU) {
      logger.warn("Service zones not found, skipping shipping options creation to avoid crash.");
  } else {
      // Check if shipping options already exist to avoid duplicates
      // Use the Fulfillment Module Service to list options
      // Note: listShippingOptions on the service might require different arguments or might not be exposed directly in all versions, 
      // but commonly available. If not, we can rely on the fact that if service zone has options, we skip.
      
      // Since filtering by name might be tricky depending on version, let's just check if ANY options exist 
      // for this profile/zone combination if possible, or simpler: list all options and check names.
      // However, module service methods can vary. Safest is to list and check names.
      
      // NOTE: fulfillmentModuleService.listShippingOptions() expected 'service_zone_id' in earlier steps, 
      // but TypeScript suggests 'service_zone' object filter or similar.
      // Let's check the type definition. Usually ID filtering is supported or we filter in memory.
      // If direct filtering fails, we can list all and filter in JS.
      
      const allOptions = await fulfillmentModuleService.listShippingOptions(
          { service_zone_id: [serviceZoneNA.id, serviceZoneEU.id] } as any
      ).catch(() => []); // Fallback if filter is invalid
      
      // If the above throw or returned all, let's ensure we really filtered
      const existingOptions = allOptions.filter((o: any) => 
          o.service_zone_id === serviceZoneNA.id || o.service_zone_id === serviceZoneEU.id
      );
      
      const existingNames = new Set(existingOptions.map(o => o.name));

      const shippingOptionsToCreate: any[] = [];

      // NA Standard
      if (!existingNames.has("Standard Shipping (3-5 days)")) {
          shippingOptionsToCreate.push({
            name: "Standard Shipping (3-5 days)",
            price_type: "flat",
            provider_id: "manual_manual",
            service_zone_id: serviceZoneNA.id,
            shipping_profile_id: shippingProfile.id,
            type: {
              label: "Standard",
              description: "Delivery in 3-5 business days. Free on orders $99+",
              code: "standard",
            },
            prices: [
              { currency_code: "usd", amount: 8.95 },
              { region_id: regionUS.id, amount: 8.95 },
            ],
            rules: [
              { attribute: "enabled_in_store", value: "true", operator: "eq" },
              { attribute: "is_return", value: "false", operator: "eq" },
            ],
          });
      }

      // NA Express
      if (!existingNames.has("Express Shipping (1-2 days)")) {
        shippingOptionsToCreate.push({
            name: "Express Shipping (1-2 days)",
            price_type: "flat",
            provider_id: "manual_manual",
            service_zone_id: serviceZoneNA.id,
            shipping_profile_id: shippingProfile.id,
            type: {
              label: "Express",
              description: "Delivery in 1-2 business days.",
              code: "express",
            },
            prices: [
              { currency_code: "usd", amount: 14.95 },
              { region_id: regionUS.id, amount: 14.95 },
            ],
            rules: [
              { attribute: "enabled_in_store", value: "true", operator: "eq" },
              { attribute: "is_return", value: "false", operator: "eq" },
            ],
          });
      }

      // EU Standard
      if (!existingNames.has("Standard Shipping (5-7 days)")) {
        shippingOptionsToCreate.push({
            name: "Standard Shipping (5-7 days)",
            price_type: "flat",
            provider_id: "manual_manual",
            service_zone_id: serviceZoneEU.id,
            shipping_profile_id: shippingProfile.id,
            type: {
              label: "Standard",
              description: "Delivery in 5-7 business days.",
              code: "standard-eu",
            },
            prices: [
              { currency_code: "eur", amount: 12.95 },
              { region_id: regionEU.id, amount: 12.95 },
            ],
            rules: [
              { attribute: "enabled_in_store", value: "true", operator: "eq" },
              { attribute: "is_return", value: "false", operator: "eq" },
            ],
          });
      }

      if (shippingOptionsToCreate.length > 0) {
          await createShippingOptionsWorkflow(container).run({
            input: shippingOptionsToCreate,
          });
          logger.info(`Created ${shippingOptionsToCreate.length} missing shipping options.`);
      } else {
          logger.info("Shipping options already exist, skipping creation.");
      }
  }
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
          title: "Webshop E2E",
          type: "publishable",
          created_by: "seed-script",
        },
      ],
    },
  });
  const publishableApiKey = publishableApiKeyResult[0];
  logger.info(`PUBLISHABLE_API_KEY: ${publishableApiKey.token}`);

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableApiKey.id,
      add: [defaultSalesChannel[0].id],
    },
  });
  logger.info("Finished seeding publishable API key data.");

  logger.info("Seeding product data...");
  const productModuleService = container.resolve(Modules.PRODUCT);

  const categories = [
    { name: "Bath Towels", is_active: true },
    { name: "Hand Towels", is_active: true },
    { name: "Washcloths", is_active: true },
    { name: "Accessories", is_active: true },
  ];

  // Fetch all existing categories first to avoid case sensitivity issues in query
  // listProductCategories signature: (filters, config)
  const existingCategories = await productModuleService.listProductCategories({}, { take: 1000 });
  const existingCategoryMap = new Map(existingCategories.map(c => [(c.name || "").toLowerCase(), c]));

  let allCategories: any[] = [...existingCategories];

  for (const cat of categories) {
      if (!existingCategoryMap.has(cat.name.toLowerCase())) {
          try {
            logger.info(`Creating missing category: ${cat.name}`);
            const { result } = await createProductCategoriesWorkflow(container).run({
                input: { product_categories: [cat] }, // Create one by one to isolate failures
            });
            allCategories.push(result[0]);
          } catch (e) {
              logger.warn(`Failed to create category ${cat.name}, might have been created concurrently or handle conflict.`);
              // Attempt to fetch it again just in case
              const [refetched] = await productModuleService.listProductCategories({ name: cat.name });
              if (refetched) allCategories.push(refetched);
          }
      }
  }

  // Duplicate declaration removed; using 'allCategories' from above
  // const allCategories = ... (removed)

  // Ensure we have at least one category to assign
  let fallbackCategory: any;
  if (allCategories.length > 0) {
      fallbackCategory = allCategories[0];
  } else {
      // Create a fallback one
       const { result } = await createProductCategoriesWorkflow(container).run({
            input: { product_categories: [{ name: "General" }] },
        });
        fallbackCategory = result[0];
        allCategories.push(fallbackCategory);
  }

  const getCategoryId = (name: string) => {
      const found = allCategories.find(c => c.name?.toLowerCase() === name.toLowerCase());
      return found ? found.id : fallbackCategory.id;
  };

  // Variant attributes for shipping/customs (applied to all variants of a product)
  // These are set at the variant level in Medusa v2
  const nuzzleVariantAttrs = {
    weight: 100,        // grams
    height: 33,         // cm (13 inches)
    width: 33,          // cm (13 inches)
    length: 2,          // cm (folded thickness)
    hs_code: "6302.60", // HS code for cotton terry toweling
    origin_country: "PT", // Made in Portugal
    mid_code: undefined,
    material: "100% Long-Staple Turkish Cotton",
  };

  const cradleVariantAttrs = {
    weight: 200,        // grams
    height: 76,         // cm (30 inches)
    width: 51,          // cm (20 inches)
    length: 3,          // cm (folded thickness)
    hs_code: "6302.60", // HS code for cotton terry toweling
    origin_country: "PT", // Made in Portugal
    mid_code: undefined,
    material: "100% Long-Staple Turkish Cotton",
  };

  const bearhugVariantAttrs = {
    weight: 700,        // grams
    height: 147,        // cm (58 inches)
    width: 76,          // cm (30 inches)
    length: 5,          // cm (folded thickness)
    hs_code: "6302.60", // HS code for cotton terry toweling
    origin_country: "PT", // Made in Portugal
    mid_code: undefined,
    material: "100% Long-Staple Turkish Cotton",
  };

  const dryerBallsVariantAttrs = {
    weight: 150,        // grams (for 3 balls)
    height: 8,          // cm (3 inch diameter)
    width: 8,           // cm
    length: 8,          // cm
    hs_code: "5105.39", // HS code for wool
    origin_country: "NZ", // New Zealand wool
    mid_code: undefined,
    material: "100% New Zealand Wool",
  };

  const productsToCreate = [
      {
          title: "The Nuzzle",
          category_ids: [getCategoryId("Washcloths")],
          description: "Our signature washcloth...",
          handle: "the-nuzzle",
          weight: 100,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [{ url: "/washcloth-nuzzle.jpg" }],
          metadata: { dimensions: '13" x 13"', features: ["100% Long-Staple Cotton", "Perfect Face Cloth Size", "Oeko-Tex Certified", "Made in Portugal"], care_instructions: ["Machine wash warm", "Tumble dry low", "Do not bleach", "Avoid fabric softeners"] },
          options: [{ title: "Color", values: ["Cloud White", "Sage", "Terra Cotta"] }],
          variants: [
              { title: "Cloud White", sku: "NUZZLE-WHITE", options: { Color: "Cloud White" }, ...nuzzleVariantAttrs, prices: [{ amount: 16, currency_code: "eur" }, { amount: 18, currency_code: "usd" }, { amount: 24, currency_code: "cad" }] },
              { title: "Sage", sku: "NUZZLE-SAGE", options: { Color: "Sage" }, ...nuzzleVariantAttrs, prices: [{ amount: 16, currency_code: "eur" }, { amount: 18, currency_code: "usd" }, { amount: 24, currency_code: "cad" }] },
              { title: "Terra Cotta", sku: "NUZZLE-TERRACOTTA", options: { Color: "Terra Cotta" }, ...nuzzleVariantAttrs, prices: [{ amount: 16, currency_code: "eur" }, { amount: 18, currency_code: "usd" }, { amount: 24, currency_code: "cad" }] }
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }]
      },
      {
          title: "The Cradle",
          category_ids: [getCategoryId("Hand Towels")],
          description: "The perfect hand towel...",
          handle: "the-cradle",
          weight: 200,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [{ url: "/hand-towel-cradle.jpg" }],
          metadata: { dimensions: '20" x 30"', features: ["High Absorbency", "Quick Drying", "Double-Stitched Hems", "Sustainably Sourced"], care_instructions: ["Machine wash warm", "Tumble dry low", "Do not bleach", "Avoid fabric softeners"] },
          options: [{ title: "Color", values: ["Cloud White", "Charcoal", "Navy"] }],
          variants: [
              { title: "Cloud White", sku: "CRADLE-WHITE", options: { Color: "Cloud White" }, ...cradleVariantAttrs, prices: [{ amount: 22, currency_code: "eur" }, { amount: 25, currency_code: "usd" }, { amount: 34, currency_code: "cad" }] },
              { title: "Charcoal", sku: "CRADLE-CHARCOAL", options: { Color: "Charcoal" }, ...cradleVariantAttrs, prices: [{ amount: 22, currency_code: "eur" }, { amount: 25, currency_code: "usd" }, { amount: 34, currency_code: "cad" }] },
              { title: "Navy", sku: "CRADLE-NAVY", options: { Color: "Navy" }, ...cradleVariantAttrs, prices: [{ amount: 22, currency_code: "eur" }, { amount: 25, currency_code: "usd" }, { amount: 34, currency_code: "cad" }] }
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }]
      },
      {
          title: "The Bear Hug",
          category_ids: [getCategoryId("Bath Towels")],
          description: "Wrap yourself in a warm embrace...",
          handle: "the-bearhug",
          weight: 700,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [{ url: "/bath-towel-bearhug.jpg" }, { url: "/white_bathtowel_laidout_product.png" }, { url: "/white_bathtowel_folded_product.png" }],
          metadata: { dimensions: '30" x 58"', features: ["Oversized for Comfort", "700 GSM Weight", "Cloud-like Softness", "Fade Resistant"], care_instructions: ["Machine wash warm", "Tumble dry low", "Do not bleach", "Avoid fabric softeners"] },
          options: [{ title: "Color", values: ["Cloud White", "Sand", "Stone"] }],
          variants: [
              { title: "Cloud White", sku: "BEARHUG-WHITE", options: { Color: "Cloud White" }, ...bearhugVariantAttrs, prices: [{ amount: 30, currency_code: "eur" }, { amount: 35, currency_code: "usd" }, { amount: 48, currency_code: "cad" }] },
              { title: "Sand", sku: "BEARHUG-SAND", options: { Color: "Sand" }, ...bearhugVariantAttrs, prices: [{ amount: 30, currency_code: "eur" }, { amount: 35, currency_code: "usd" }, { amount: 48, currency_code: "cad" }] },
              { title: "Stone", sku: "BEARHUG-STONE", options: { Color: "Stone" }, ...bearhugVariantAttrs, prices: [{ amount: 30, currency_code: "eur" }, { amount: 35, currency_code: "usd" }, { amount: 48, currency_code: "cad" }] }
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }]
      },
      {
          title: "3 Wool Dryer Balls",
          category_ids: [getCategoryId("Accessories")],
          description: "Reduce drying time and soften fabrics naturally...",
          handle: "the-wool-dryer-ball",
          weight: 150,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [{ url: "/wood_dryer_balls.png" }],
          metadata: { dimensions: '3" Diameter', features: ["100% New Zealand Wool", "Reduces Drying Time", "Hypoallergenic", "Lasts for 1000+ Loads"], care_instructions: ["Store in a dry place", "Recharge in sun monthly"], disable_embroidery: "true" },
          options: [{ title: "Type", values: ["Natural"] }],
          variants: [
              { title: "Natural", sku: "DRYER-BALLS-3", options: { Type: "Natural" }, ...dryerBallsVariantAttrs, prices: [{ amount: 16, currency_code: "eur" }, { amount: 18, currency_code: "usd" }, { amount: 24, currency_code: "cad" }] }
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }]
      }
  ];

  const existingProducts = await productModuleService.listProducts({
      handle: productsToCreate.map(p => p.handle)
  });
  const existingHandles = new Set(existingProducts.map(p => p.handle));

  const newProducts = productsToCreate.filter(p => !existingHandles.has(p.handle));

  if (newProducts.length > 0) {
      await createProductsWorkflow(container).run({
        input: { products: newProducts }
      });
      logger.info("Created " + newProducts.length + " new products.");
  }

  // Map of product handles to their variant attributes
  const variantAttrsByHandle: Record<string, typeof nuzzleVariantAttrs> = {
    "the-nuzzle": nuzzleVariantAttrs,
    "the-cradle": cradleVariantAttrs,
    "the-bearhug": bearhugVariantAttrs,
    "the-wool-dryer-ball": dryerBallsVariantAttrs,
  };
  const priceConfigByHandle: Record<string, { usd: number; eur: number; cad: number }> = {
    "the-nuzzle": { usd: 18, eur: 16, cad: 24 },
    "the-cradle": { usd: 25, eur: 22, cad: 34 },
    "the-bearhug": { usd: 35, eur: 30, cad: 48 },
    "the-wool-dryer-ball": { usd: 18, eur: 16, cad: 24 },
  };

  // Ensure ALL existing products are linked to the default sales channel, published, and have variant attributes
  // This fixes products that were created but not properly linked or are in draft status
  for (const existingProduct of existingProducts) {
    // Use query.graph to check if product is linked to sales channel
    let isLinked = false;
    try {
      const { data: linkedChannels } = await query.graph({
        entity: "product_sales_channel",
        fields: ["sales_channel_id"],
        filters: {
          product_id: existingProduct.id,
          sales_channel_id: defaultSalesChannel[0].id,
        },
      });
      isLinked = linkedChannels.length > 0;
    } catch (e) {
      // If query fails, assume not linked
      logger.warn(`Could not check sales channel link for "${existingProduct.handle}": ${(e as Error).message}`);
    }

    if (!isLinked) {
      try {
        await link.create({
          [Modules.PRODUCT]: { product_id: existingProduct.id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: defaultSalesChannel[0].id },
        });
        logger.info(`Linked existing product "${existingProduct.handle}" to default sales channel.`);
      } catch (e) {
        // Link might already exist, ignore
        logger.warn(`Could not link product "${existingProduct.handle}" to sales channel: ${(e as Error).message}`);
      }
    }

    // Ensure product is published (not draft)
    if (existingProduct.status !== ProductStatus.PUBLISHED) {
      try {
        await productModuleService.updateProducts(existingProduct.id, {
          status: ProductStatus.PUBLISHED,
        });
        logger.info(`Published existing product "${existingProduct.handle}".`);
      } catch (e) {
        logger.warn(`Could not publish product "${existingProduct.handle}": ${(e as Error).message}`);
      }
    }

    // Update existing variants with shipping/customs attributes
    const variantAttrs = variantAttrsByHandle[existingProduct.handle as string];
    if (variantAttrs) {
      try {
        // Get product variants
        const productWithVariants = await productModuleService.retrieveProduct(existingProduct.id, {
          relations: ["variants", "variants.prices"],
        });

        for (const variant of productWithVariants.variants || []) {
          try {
            // Check if variant needs updating (if weight is null or 0, it likely needs attrs)
            const needsUpdate = !variant.weight || !variant.height || !variant.origin_country;
            if (needsUpdate) {
              await productModuleService.updateProductVariants(variant.id, {
                weight: variantAttrs.weight,
                height: variantAttrs.height,
                width: variantAttrs.width,
                length: variantAttrs.length,
                hs_code: variantAttrs.hs_code,
                origin_country: variantAttrs.origin_country,
                mid_code: variantAttrs.mid_code,
                material: variantAttrs.material,
              });
              logger.info(`Updated variant "${variant.sku}" with shipping/customs attributes.`);
            }
          } catch (e) {
            logger.warn(`Could not update variant "${variant.sku}" for "${existingProduct.handle}": ${(e as Error).message}`);
          }

          const priceConfig = priceConfigByHandle[existingProduct.handle as string];
          if (priceConfig) {
            const existingPrices = (variant as { prices?: Array<{ amount?: number; price_set_id?: string | null; currency_code?: string | null }> }).prices || [];
            const hasValidPrice = existingPrices.some((price) => typeof price.amount === "number" && price.amount > 0);
            let priceSetId = existingPrices.find((price) => price.price_set_id)?.price_set_id || null;
            if (!priceSetId) {
              try {
                const variantPriceSetLinksResult = await query.graph({
                  entity: "product_variant_price_set",
                  fields: ["price_set_id"],
                  filters: { variant_id: variant.id },
                }) as { data: Array<{ price_set_id?: string | null }> };
                const variantPriceSetLinks = variantPriceSetLinksResult.data || [];
                if (variantPriceSetLinks.length > 0) {
                  priceSetId = variantPriceSetLinks[0].price_set_id || null;
                }
              } catch (e) {
                logger.warn(`Could not check price set link for "${variant.sku}": ${(e as Error).message}`);
              }
            }

            if (!hasValidPrice) {
              try {
                if (priceSetId) {
                  await pricingModuleService.updatePriceSets(priceSetId, {
                    prices: [
                      { amount: priceConfig.usd, currency_code: "usd" },
                      { amount: priceConfig.eur, currency_code: "eur" },
                      { amount: priceConfig.cad, currency_code: "cad" },
                    ],
                  });
                  logger.info(`Updated prices for "${variant.sku}" on "${existingProduct.handle}" (existing price set).`);
                  continue;
                }
                const [priceSet] = await pricingModuleService.createPriceSets([
                  {
                    prices: [
                      { amount: priceConfig.usd, currency_code: "usd" },
                      { amount: priceConfig.eur, currency_code: "eur" },
                      { amount: priceConfig.cad, currency_code: "cad" },
                    ],
                  },
                ]);

                if (priceSet) {
                  await link.create({
                    [Modules.PRODUCT]: { variant_id: variant.id },
                    [Modules.PRICING]: { price_set_id: priceSet.id },
                  });
                  logger.info(`Added prices for "${variant.sku}" on "${existingProduct.handle}".`);
                }
              } catch (e) {
                logger.warn(`Could not add prices for "${variant.sku}": ${(e as Error).message}`);
              }
            }
          }
        }
      } catch (e) {
        logger.warn(`Could not update variants for "${existingProduct.handle}": ${(e as Error).message}`);
      }
    }
  }

  logger.info("Finished seeding product data (" + newProducts.length + " new).");

  try {
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
  } catch (e) {
      logger.warn("Seeding inventory levels failed (likely already exist): " + e.message);
  }


}
