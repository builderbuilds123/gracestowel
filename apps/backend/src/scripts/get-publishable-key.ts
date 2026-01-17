import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export default async function getPublishableKey({ container }: ExecArgs) {
  const apiKeyModuleService = container.resolve(Modules.API_KEY);
  
  console.log("Searching for 'Webshop E2E' publishable key...");
  
  const apiKeys = await apiKeyModuleService.listApiKeys({
      title: "Webshop E2E",
      type: "publishable"
  });

  if (apiKeys.length > 0) {
      console.log(`Found 'Webshop E2E' Publishable Key (ID: ${apiKeys[0].id})`);
  } else {
      console.log("Webshop E2E key not found. Listing all publishable keys:");
      const allKeys = await apiKeyModuleService.listApiKeys({ type: "publishable" });
      
      if(allKeys.length > 0) {
          console.log(`Found Publishable Key (ID: ${allKeys[0].id})`);
      } else {
          console.log("No publishable keys found.");
      }
  }
}
