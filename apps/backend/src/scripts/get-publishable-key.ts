import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export default async function getPublishableKey({ container }: ExecArgs) {
  const apiKeyModuleService = container.resolve(Modules.API_KEY);
  
  const apiKeys = await apiKeyModuleService.listApiKeys({
      title: "Webshop E2E",
      type: "publishable"
  });

  let token = "";
  if (apiKeys.length > 0) {
      token = apiKeys[0].token;
  } else {
      const allKeys = await apiKeyModuleService.listApiKeys({ type: "publishable" });
      if(allKeys.length > 0) {
          token = allKeys[0].token;
      }
  }

  if (token) {
    process.stdout.write(token);
  } else {
    process.exit(1);
  }
}
