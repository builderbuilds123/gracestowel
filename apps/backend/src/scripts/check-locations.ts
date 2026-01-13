
import { getDbClient } from "./utils";

async function main() {
    const client = await getDbClient();
    try {
        console.log("--- Stock Locations ---");
        const res = await client.query("SELECT id, name, created_at FROM stock_location");
        if (res.rows.length === 0) {
            console.log("NO STOCK LOCATIONS FOUND!");
        } else {
            console.table(res.rows);
        }
        
        console.log("\n--- Sales Channel Locations ---");
        const res2 = await client.query(`
            SELECT sc.name as channel, sl.name as location 
            FROM sales_channel sc
            JOIN sales_channel_stock_location scsl ON sc.id = scsl.sales_channel_id
            JOIN stock_location sl ON scsl.stock_location_id = sl.id
        `);
        console.table(res2.rows);

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

main();
