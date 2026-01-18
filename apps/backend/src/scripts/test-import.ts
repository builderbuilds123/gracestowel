
// @ts-ignore
import { orderEditAddNewItemWorkflow } from "@medusajs/core-flows/dist/order/workflows/order-edit/order-edit-add-new-item";

export default async function testImport() {
    console.log("Import result:", typeof orderEditAddNewItemWorkflow);
    if (typeof orderEditAddNewItemWorkflow !== 'function' && typeof orderEditAddNewItemWorkflow !== 'object') {
        throw new Error("Import failed to get workflow");
    }
}
