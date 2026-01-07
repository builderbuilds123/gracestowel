import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

export default async function getPublishableKey({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  
  const { data: apiKeys } = await query.graph({
    entity: "api_key",
    fields: ["token", "type"],
    filters: {
        type: "publishable"
    }
  });

  if (apiKeys.length > 0) {
    // Print specifically formatted line for easy parsing
    console.log(`MEDUSA_PUBLISHABLE_KEY=${apiKeys[0].token}`);
  } else {
    console.error("No publishable key found");
  }
}
