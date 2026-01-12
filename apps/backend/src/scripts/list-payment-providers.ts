import { ExecArgs } from "@medusajs/framework/types";

export default async function listPaymentProviders({ container }: ExecArgs) {
  const query = container.resolve("query");

  const { data: providers } = await query.graph({
    entity: "payment_provider",
    fields: ["id", "is_active"],
  });

  console.log("=== Available Payment Providers ===");
  console.log(JSON.stringify(providers, null, 2));
}
