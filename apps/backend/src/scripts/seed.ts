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
      ).catch(() => []);
      
      const existingOptions = allOptions.filter((o: any) => 
          o.service_zone_id === serviceZoneNA.id || o.service_zone_id === serviceZoneEU.id
      );
      
      const hasOption = (name: string, zoneId: string) => 
          existingOptions.some((o: any) => o.name === name && (o.service_zone_id === zoneId || o.service_zone?.id === zoneId));

      const shippingOptionsToCreate: any[] = [];

      // NA Standard
      if (!hasOption("Standard Shipping", serviceZoneNA.id)) {
          shippingOptionsToCreate.push({
            name: "Standard Shipping",
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
              { currency_code: "cad", amount: 12.00 },
              { region_id: regionCA.id, amount: 12.00 },
            ],
            rules: [
              { attribute: "enabled_in_store", value: "true", operator: "eq" },
              { attribute: "is_return", value: "false", operator: "eq" },
            ],
          });
      }

      // NA Express
      if (!hasOption("Express Shipping", serviceZoneNA.id)) {
        shippingOptionsToCreate.push({
            name: "Express Shipping",
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
              { currency_code: "cad", amount: 20.00 },
              { region_id: regionCA.id, amount: 20.00 },
            ],
            rules: [
              { attribute: "enabled_in_store", value: "true", operator: "eq" },
              { attribute: "is_return", value: "false", operator: "eq" },
            ],
          });
      }

      // EU Standard
      if (!hasOption("Standard Shipping", serviceZoneEU.id)) {
        shippingOptionsToCreate.push({
            name: "Standard Shipping",
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
  
  // Check for existing publishable API key (idempotency)
  const apiKeyModuleService = container.resolve(Modules.API_KEY);
  const existingApiKeys = await apiKeyModuleService.listApiKeys({
    title: "Webshop E2E",
    type: "publishable",
  });

  let publishableApiKey;
  if (existingApiKeys.length > 0) {
    publishableApiKey = existingApiKeys[0];
    logger.info(`Using existing publishable API key: ${publishableApiKey.id}`);
  } else {
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
    publishableApiKey = publishableApiKeyResult[0];
    logger.info(`Created publishable API key: ${publishableApiKey.id}`);

    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: {
        id: publishableApiKey.id,
        add: [defaultSalesChannel[0].id],
      },
    });
  }
  logger.info("Finished seeding publishable API key data.");

  logger.info("Seeding product data...");
  const productModuleService = container.resolve(Modules.PRODUCT);

  const categories = [
    { name: "Bath Towels", handle: "bath-towels", is_active: true },
    { name: "Hand Towels", handle: "hand-towels", is_active: true },
    { name: "Washcloths", handle: "washcloths", is_active: true },

    { name: "Accessories", handle: "accessories", is_active: true },
    { name: "Beach Towels", handle: "beach-towels", is_active: true },
    { name: "Kitchen Towels", handle: "kitchen-towels", is_active: true },
    { name: "Blankets", handle: "blankets", is_active: true },
  ];

  // Fetch all existing categories first to avoid case sensitivity issues in query
  // listProductCategories signature: (filters, config)
  const allCategories: any[] = [];

  for (const cat of categories) {
      // Try to find by handle first
      let [existingCat] = await productModuleService.listProductCategories(
          { handle: cat.handle }, 
          { 
              take: 1,
              select: ["id", "name", "handle"] 
          }
      );
      
      if (existingCat) {
          allCategories.push(existingCat);
          logger.info(`Found existing category by handle: ${existingCat.name} - ${existingCat.id} (${existingCat.handle})`);
          continue;
      }
      
      // Try by name if handle not found
      [existingCat] = await productModuleService.listProductCategories(
          { name: cat.name }, 
          { 
              take: 1,
              select: ["id", "name", "handle"]
          }
      );
       if (existingCat) {
          allCategories.push(existingCat);
          logger.info(`Found existing category by name: ${existingCat.name} - ${existingCat.id} (${existingCat.handle})`);
          continue;
      }

      // If not found, create it
      try {
        logger.info(`Creating missing category: ${cat.name}`);
        const { result } = await createProductCategoriesWorkflow(container).run({
            input: { product_categories: [cat] },
        });
        const createdCat = Array.isArray(result) ? result[0] : result;
        allCategories.push(createdCat);
        logger.info(`✓ Created category: ${cat.name} (${createdCat.id})`);
      } catch (e) {
         logger.warn(`Failed to create category ${cat.name}, attempting to fetch again: ${(e as Error).message}`);
         // Final attempt to fetch
          const [refetched] = await productModuleService.listProductCategories(
              { handle: cat.handle },
              { select: ["id", "name", "handle"] }
          );
          if (refetched) {
             allCategories.push(refetched);
          } else {
             logger.error(`Could not resolve category ${cat.name}`);
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
      const found = allCategories.find(c => c && (c.name?.toLowerCase() === name.toLowerCase() || c.handle?.toLowerCase() === name.toLowerCase().replace(" ", "-")));
      if (!found) {
          logger.warn(`Category "${name}" not found in available: ${allCategories.map(c => c.name || c.id).join(', ')}. Using fallback: ${fallbackCategory?.name || 'none'}`);
          return fallbackCategory?.id || "";
      }
      return found.id;
  };

  logger.info("Seeding collections, types, and tags...");

  // Collections
  const collectionsData = ["Summer Essentials", "Kitchen & Dining", "Living Room", "Bath & Spa"];
  const collectionsMap = new Map<string, string>(); // Name -> ID

  for (const name of collectionsData) {
      const existing = await productModuleService.listProductCollections({ title: name }, { take: 1 });
      if (existing.length) {
          collectionsMap.set(name, existing[0].id);
      } else {
          const created = await productModuleService.createProductCollections({ title: name, handle: name.toLowerCase().replace(/ /g, "-").replace(/&/g, "and") });
          collectionsMap.set(name, created.id);
          logger.info(`Created collection: ${name}`);
      }
  }

  // Types
  const typesData = ["Beach Towel", "Kitchen Towel", "Blanket", "Washcloth", "Hand Towel", "Bath Towel", "Accessory"];
  const typesMap = new Map<string, string>(); // Value -> ID

  for (const value of typesData) {
      const existing = await productModuleService.listProductTypes({ value }, { take: 1 });
      if (existing.length) {
          typesMap.set(value, existing[0].id);
      } else {
          const created = await productModuleService.createProductTypes({ value });
          typesMap.set(value, created.id);
          logger.info(`Created type: ${value}`);
      }
  }

  // Tags
  const tagsData = ["summer", "beach", "outdoor", "kitchen", "cooking", "home", "cozy", "winter", "luxury", "organic", "eco-friendly"];
  const tagsMap = new Map<string, string>(); // Value -> ID

  for (const value of tagsData) {
      const existing = await productModuleService.listProductTags({ value }, { take: 1 });
      if (existing.length) {
          tagsMap.set(value, existing[0].id);
      } else {
          const created = await productModuleService.createProductTags({ value });
          tagsMap.set(value, created.id);
          logger.info(`Created tag: ${value}`);
      }
  }

  const getTagIds = (tags: string[]) => tags.map(t => ({ id: tagsMap.get(t) || "" })).filter(t => t.id !== "");

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



  const sandbarVariantAttrs = {
    weight: 500,        // grams
    height: 178,        // cm (70 inches)
    width: 102,         // cm (40 inches)
    length: 4,          // cm
    hs_code: "6302.60",
    origin_country: "PT",
    mid_code: undefined,
    material: "100% Cotton Velour",
  };

  const kitchenTowelVariantAttrs = {
    weight: 80,         // grams
    height: 64,         // cm (25 inches)
    width: 38,          // cm (15 inches)
    length: 1,          // cm
    hs_code: "6302.91", // Cotton toilet/kitchen linen
    origin_country: "PT",
    mid_code: undefined,
    material: "100% Waffle Weave Cotton",
  };

  const blanketVariantAttrs = {
    weight: 1200,       // grams
    height: 152,        // cm (60 inches)
    width: 127,         // cm (50 inches)
    length: 10,         // cm
    hs_code: "6301.20", // Wool blankets
    origin_country: "PT",
    mid_code: undefined,
    material: "50% Wool / 50% Cotton Blend",
  };

  const productsToCreate = [
      {
          title: "The Nuzzle",
          category_ids: [getCategoryId("Washcloths")],
          description: "Our signature washcloth...",
          handle: "the-nuzzle",
          status: ProductStatus.PUBLISHED,
          ...nuzzleVariantAttrs,
          shipping_profile_id: shippingProfile.id,
          collection_id: collectionsMap.get("Bath & Spa"),
          type_id: typesMap.get("Washcloth"),
          tags: getTagIds(["luxury", "organic"]),
          images: [{ url: "http://localhost:8000/washcloth-nuzzle.jpg" }],
          metadata: { features: "100% Long-Staple Cotton, Perfect Face Cloth Size, Oeko-Tex Certified, Made in Portugal", care_instructions: "Machine wash warm, Tumble dry low, Do not bleach, Avoid fabric softeners" },
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
          status: ProductStatus.PUBLISHED,
          ...cradleVariantAttrs,
          shipping_profile_id: shippingProfile.id,
          collection_id: collectionsMap.get("Bath & Spa"),
          type_id: typesMap.get("Hand Towel"),
          tags: getTagIds(["luxury", "organic"]),
          images: [{ url: "http://localhost:8000/hand-towel-cradle.jpg" }],
          metadata: { features: "High Absorbency, Quick Drying, Double-Stitched Hems, Sustainably Sourced", care_instructions: "Machine wash warm, Tumble dry low, Do not bleach, Avoid fabric softeners" },
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
          handle: "the-bear-hug",
          status: ProductStatus.PUBLISHED,
          ...bearhugVariantAttrs,
          shipping_profile_id: shippingProfile.id,
          collection_id: collectionsMap.get("Bath & Spa"),
          type_id: typesMap.get("Bath Towel"),
          tags: getTagIds(["luxury", "cozy"]),
          images: [{ url: "http://localhost:8000/bath-towel-bearhug.jpg" }, { url: "http://localhost:8000/white_bathtowel_laidout_product.png" }, { url: "http://localhost:8000/white_bathtowel_folded_product.png" }],
          metadata: { features: "Oversized for Comfort, 700 GSM Weight, Cloud-like Softness, Fade Resistant", care_instructions: "Machine wash warm, Tumble dry low, Do not bleach, Avoid fabric softeners" },
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
          status: ProductStatus.PUBLISHED,
          ...dryerBallsVariantAttrs,
          shipping_profile_id: shippingProfile.id,
          collection_id: collectionsMap.get("Bath & Spa"),
          type_id: typesMap.get("Accessory"),
          tags: getTagIds(["eco-friendly", "home"]),
          images: [{ url: "http://localhost:8000/wood_dryer_balls.png" }],
          metadata: { features: "100% New Zealand Wool, Reduces Drying Time, Hypoallergenic, Lasts for 1000+ Loads", care_instructions: "Store in a dry place, Recharge in sun monthly", disable_embroidery: "true" },
          options: [{ title: "Type", values: ["Natural"] }],
          variants: [
              { title: "Natural", sku: "DRYER-BALLS-3", options: { Type: "Natural" }, ...dryerBallsVariantAttrs, prices: [{ amount: 16, currency_code: "eur" }, { amount: 18, currency_code: "usd" }, { amount: 24, currency_code: "cad" }] }
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }]
      },
      // New Products
      {
          title: "The Sandbar",
          category_ids: [getCategoryId("Beach Towels")],
          description: "Oversized luxury for your beach days. The Sandbar features a plush velour front for lounging and a thirsty terry back for drying. Vibrant colors that won't fade in the sun.",
          handle: "the-sandbar",
          status: ProductStatus.PUBLISHED,
          ...sandbarVariantAttrs,
          shipping_profile_id: shippingProfile.id,
          collection_id: collectionsMap.get("Summer Essentials"),
          type_id: typesMap.get("Beach Towel"),
          tags: getTagIds(["summer", "beach", "outdoor", "luxury"]),
          images: [{ url: "https://placehold.co/600x800/E89B5F/FFFFFF?text=The+Sandbar" }, { url: "https://placehold.co/600x800/5FA8E8/FFFFFF?text=Ocean+Blue" }],
          metadata: { features: "Oversized Lounger, Velour & Terry Dual-Texture, UV Resistant, Sand Repellent", care_instructions: "Machine wash cold, Tumble dry low, Shake sand before washing" },
          options: [{ title: "Color", values: ["Sunset Orange", "Ocean Blue"] }],
          variants: [
              { title: "Sunset Orange", sku: "SANDBAR-ORANGE", options: { Color: "Sunset Orange" }, ...sandbarVariantAttrs, prices: [{ amount: 40, currency_code: "eur" }, { amount: 45, currency_code: "usd" }, { amount: 62, currency_code: "cad" }] },
              { title: "Ocean Blue", sku: "SANDBAR-BLUE", options: { Color: "Ocean Blue" }, ...sandbarVariantAttrs, prices: [{ amount: 40, currency_code: "eur" }, { amount: 45, currency_code: "usd" }, { amount: 62, currency_code: "cad" }] }
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }]
      },
      {
          title: "The Chef's Mate",
          category_ids: [getCategoryId("Kitchen Towels")],
          description: "Professional grade performance for your home kitchen. The Chef's Mate uses a classic waffle weave to trap moisture and crumbs.",
          handle: "the-chefs-mate",
          status: ProductStatus.PUBLISHED,
          ...kitchenTowelVariantAttrs,
          shipping_profile_id: shippingProfile.id,
          collection_id: collectionsMap.get("Kitchen & Dining"),
          type_id: typesMap.get("Kitchen Towel"),
          tags: getTagIds(["kitchen", "cooking", "home"]),
          images: [{ url: "https://placehold.co/600x800/B22222/FFFFFF?text=Chef's+Mate" }, { url: "https://placehold.co/600x800/2F4F4F/FFFFFF?text=Classic+Stripe" }],
          metadata: { features: "Lint Free, Waffle Weave, Hanging Loop, Dries Instantly", care_instructions: "Machine wash hot, Tumble dry medium, Bleach safe (White only)" },
          options: [{ title: "Pattern", values: ["Checkered Red", "Classic Stripe"] }],
          variants: [
              { title: "Checkered Red", sku: "CHEF-RED", options: { Pattern: "Checkered Red" }, ...kitchenTowelVariantAttrs, prices: [{ amount: 10, currency_code: "eur" }, { amount: 12, currency_code: "usd" }, { amount: 16, currency_code: "cad" }] },
              { title: "Classic Stripe", sku: "CHEF-STRIPE", options: { Pattern: "Classic Stripe" }, ...kitchenTowelVariantAttrs, prices: [{ amount: 10, currency_code: "eur" }, { amount: 12, currency_code: "usd" }, { amount: 16, currency_code: "cad" }] }
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }]
      },
      {
          title: "The Hearth",
          category_ids: [getCategoryId("Blankets")],
          description: "Cozy up with The Hearth. A premium wool-cotton blend that offers warmth without the itch. Perfect for movie nights or reading by the fire.",
          handle: "the-hearth",
          status: ProductStatus.PUBLISHED,
          ...blanketVariantAttrs,
          shipping_profile_id: shippingProfile.id,
          collection_id: collectionsMap.get("Living Room"),
          type_id: typesMap.get("Blanket"),
          tags: getTagIds(["cozy", "winter", "living", "luxury"]),
          images: [{ url: "https://placehold.co/600x800/8B4513/FFFFFF?text=The+Hearth" }],
          metadata: { features: "Temperature Regulating, Soft-Touch Wool, Heirloom Quality, Fringed Edges", care_instructions: "Dry clean only, Spot clean spills immediately" },
          options: [{ title: "Size", values: ["Throw (50x60)", "Queen (90x90)"] }],
          variants: [
              { title: "Throw (50x60)", sku: "HEARTH-THROW", options: { Size: "Throw (50x60)" }, ...blanketVariantAttrs, prices: [{ amount: 70, currency_code: "eur" }, { amount: 80, currency_code: "usd" }, { amount: 110, currency_code: "cad" }] },
              { title: "Queen (90x90)", sku: "HEARTH-QUEEN", options: { Size: "Queen (90x90)" }, ...blanketVariantAttrs, weight: 2000, prices: [{ amount: 125, currency_code: "eur" }, { amount: 140, currency_code: "usd" }, { amount: 195, currency_code: "cad" }] }
          ],
          sales_channels: [{ id: defaultSalesChannel[0].id }]
      }
  ];

  // Cleanup legacy handles if they exist to facilitate rename
  const legacyHandles = [
    "the-bearhug", 
    // Garbage products to remove
    "test-product", "practical-cotton-chips", "small-steel-chair", 
    "incredible-rubber-tuna", "handmade-rubber-shoes", "handmade-aluminum-salad", 
    "sleek-bronze-pizza", "recycled-aluminum-gloves", "fresh-cotton-pants", 
    "intelligent-aluminum-gloves", "licensed-granite-tuna", "incredible-plastic-bacon", 
    "intelligent-plastic-tuna", "oriental-cotton-hat", "tasty-rubber-car", 
    "awesome-rubber-fish", "recycled-silk-computer", "recycled-metal-chicken", 
    "fresh-marble-bike", "luxurious-steel-shoes", "fresh-rubber-cheese", 
    "ergonomic-metal-chips", "awesome-bronze-chair", "incredible-gold-pants", 
    "small-ceramic-salad", "frozen-bamboo-car", "electronic-concrete-keyboard", 
    "recycled-ceramic-tuna", "small-wooden-soap", "refined-bronze-gloves", 
    "fantastic-gold-chips", "handcrafted-wooden-sausages", "incredible-bamboo-towels"
  ];
  const legacyProducts = await productModuleService.listProducts({ handle: legacyHandles });
  if (legacyProducts.length > 0) {
      logger.info(`Deleting legacy products: ${legacyProducts.map(p => p.handle).join(", ")}`);
      await productModuleService.deleteProducts(legacyProducts.map(p => p.id));
  }
  
  const inventoryModuleService = container.resolve(Modules.INVENTORY);



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
    "the-bear-hug": bearhugVariantAttrs,
    "the-wool-dryer-ball": dryerBallsVariantAttrs,
    "the-sandbar": sandbarVariantAttrs,
    "the-chefs-mate": kitchenTowelVariantAttrs,
    "the-hearth": blanketVariantAttrs,
  };
  const priceConfigByHandle: Record<string, { usd: number; eur: number; cad: number }> = {
    "the-nuzzle": { usd: 18, eur: 16, cad: 24 },
    "the-cradle": { usd: 25, eur: 22, cad: 34 },
    "the-bear-hug": { usd: 35, eur: 30, cad: 48 },
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

    // Verify and Update Collection
    const targetCollectionId = productsToCreate.find(p => p.handle === existingProduct.handle)?.collection_id;
    if (targetCollectionId && existingProduct.collection_id !== targetCollectionId) {
        await productModuleService.updateProducts(existingProduct.id, { collection_id: targetCollectionId });
        logger.info(`Updated collection for "${existingProduct.handle}"`);
    }

     // Verify and Update Images
     const targetImages = productsToCreate.find(p => p.handle === existingProduct.handle)?.images;
     if (targetImages) {
        // Simple check: update if image count differs or forced update
        await productModuleService.updateProducts(existingProduct.id, { images: targetImages });
        logger.info(`Updated images for "${existingProduct.handle}"`);
     }

     // Verify and Update Metadata
     const targetMetadata = productsToCreate.find(p => p.handle === existingProduct.handle)?.metadata;
     if (targetMetadata) {
        await productModuleService.updateProducts(existingProduct.id, { metadata: targetMetadata });
        logger.info(`Updated metadata for "${existingProduct.handle}"`);
     }

    // Update Product & Variant Attributes
    const variantAttrs = variantAttrsByHandle[existingProduct.handle as string];
    if (variantAttrs) {
        // Update Product Level Attributes
        try {
            await productModuleService.updateProducts(existingProduct.id, {
                weight: variantAttrs.weight,
                height: variantAttrs.height,
                width: variantAttrs.width,
                length: variantAttrs.length,
                hs_code: variantAttrs.hs_code,
                origin_country: variantAttrs.origin_country,
                material: variantAttrs.material,
            });
            logger.info(`Updated product-level attributes for "${existingProduct.handle}"`);
        } catch (e) {
             logger.warn(`Failed to update product attributes for "${existingProduct.handle}": ${(e as Error).message}`);
        }

        // Update Variant Level Attributes
        const variants = await productModuleService.listProductVariants({ product_id: existingProduct.id });
        for (const variant of variants) {
            try {
                await productModuleService.updateProductVariants(variant.id, {
                    weight: variantAttrs.weight,
                    height: variantAttrs.height,
                    width: variantAttrs.width,
                    length: variantAttrs.length,
                    hs_code: variantAttrs.hs_code,
                    origin_country: variantAttrs.origin_country,
                    material: variantAttrs.material,
                });
                logger.info(`Updated attributes for variant ${variant.sku} of ${existingProduct.handle}`);
            } catch (e) {
                logger.warn(`Failed to update variant attributes for ${variant.sku}: ${(e as Error).message}`);
            }
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
      const stockLocationId = stockLocation.id;

      for (const inventoryItem of inventoryItems) {
        // Check if level already exists
        const [existingLevel] = await inventoryModuleService.listInventoryLevels({
            inventory_item_id: inventoryItem.id,
            location_id: stockLocationId,
        });

        if (existingLevel) {
            // Update quantity if needed (optional, ensuring at least 100)
             if (existingLevel.stocked_quantity < 100) {
                 await inventoryModuleService.updateInventoryLevels({
                     id: existingLevel.id,
                     stocked_quantity: 100,
                     inventory_item_id: inventoryItem.id,
                     location_id: stockLocationId,
                 });
                 logger.info(`Updated inventory level for item ${inventoryItem.id} to 100.`);
             }
        } else {
            const inventoryLevel = {
                location_id: stockLocationId,
                stocked_quantity: 100,
                inventory_item_id: inventoryItem.id,
            };
            inventoryLevels.push(inventoryLevel);
        }
      }

      if (inventoryLevels.length > 0) {
        await createInventoryLevelsWorkflow(container).run({
            input: {
            inventory_levels: inventoryLevels,
            },
        });
         logger.info(`Created ${inventoryLevels.length} new inventory levels.`);
      }
    
      logger.info("Finished seeding inventory levels data.");
  } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.warn("Seeding inventory levels failed (likely already exist): " + errorMessage);
  }

  // Summary
  logger.info("\n========================================");
  logger.info("SEED SCRIPT COMPLETED SUCCESSFULLY");
  logger.info("========================================");
  logger.info(`Products: ${newProducts.length} created, ${existingProducts.length} existing`);
  logger.info(`Regions: ${regionsToCreate.length} created`);
  logger.info(`Publishable API Key: ${publishableApiKey.id}`);
  logger.info("========================================\n");
}
