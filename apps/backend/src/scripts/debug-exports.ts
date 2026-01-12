import * as coreFlows from "@medusajs/core-flows"

export default async function debugExports() {
  console.log("Keys in coreFlows:", Object.keys(coreFlows).filter(k => k.toLowerCase().includes("cancel") || k.toLowerCase().includes("refund")))
}
