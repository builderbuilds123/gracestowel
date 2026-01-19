
import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export default async function debugOrderModule({ container }: ExecArgs) {
    const orderModule = container.resolve(Modules.ORDER);
    // console.log("Order Module object:", orderModule); 
    // Just checking keys can be huge if it's a proxy, but let's try.
    // If it's a service, it should have methods.
    
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(orderModule));
    console.log("Order Service methods (Edit/Change):", methods.filter(k => k.toLowerCase().includes("edit") || k.toLowerCase().includes("change")));
    
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    try {
       await query.graph({ entity: "order_edit", fields: ["id"], pagination: { take: 1 } });
       console.log("Query 'order_edit': Success");
    } catch (e) {
       console.log("Query 'order_edit': Failed -", e instanceof Error ? e.message : String(e));
    }
    
    try {
       await query.graph({ entity: "order_change", fields: ["id"], pagination: { take: 1 } });
       console.log("Query 'order_change': Success");
    } catch (e) {
       console.log("Query 'order_change': Failed -", e instanceof Error ? e.message : String(e));
    }
}
