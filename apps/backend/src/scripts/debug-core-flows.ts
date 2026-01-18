
import * as CoreFlows from "@medusajs/core-flows";

export default async function debugCoreFlows() {
    const keys = Object.keys(CoreFlows);
    const orderEdits = keys.filter(k => k.toLowerCase().includes("order") && k.toLowerCase().includes("edit"));
    console.log("Order Edit Workflows:", orderEdits.sort());
}
