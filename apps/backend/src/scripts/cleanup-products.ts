import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

export default async function({ container }: ExecArgs) {
  const productModuleService = container.resolve(Modules.PRODUCT);
  const inventoryModuleService = container.resolve(Modules.INVENTORY);
  
  const handlesToCleanup = ["the-sandbar", "the-hearth", "the-nuzzle"];
  const skusToCleanup = [
    "SANDBAR-ORANGE", "SANDBAR-BLUE",
    "HEARTH-THROW", "HEARTH-QUEEN", "HEARTH-WALNUT", "HEARTH-SLATE",
    "NUZZLE-WHITE", "NUZZLE-SAGE", "NUZZLE-TERRACOTTA"
  ];
  
  console.log(`Cleaning up inventory items for SKUs: ${skusToCleanup.join(", ")}`);
  const inventoryItems = await inventoryModuleService.listInventoryItems({
    sku: skusToCleanup
  });
  
  if (inventoryItems.length > 0) {
    console.log(`Found ${inventoryItems.length} inventory items. Deleting...`);
    await inventoryModuleService.deleteInventoryItems(inventoryItems.map(i => i.id));
  } else {
    console.log("No matching inventory items found.");
  }

  console.log(`Searching for products with handles: ${handlesToCleanup.join(", ")}`);
  const products = await productModuleService.listProducts({
    handle: handlesToCleanup
  });
  
  if (products.length > 0) {
    const idsToDelete = products.map(p => p.id);
    console.log(`Deleting products with IDs: ${idsToDelete.join(", ")}`);
    await productModuleService.deleteProducts(idsToDelete);
  } else {
    console.log("No matching products found to delete.");
  }
  
  console.log("Cleanup complete.");
}
