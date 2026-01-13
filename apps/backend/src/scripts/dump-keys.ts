
import { getDbClient } from "./utils";

async function main() {
    const client = await getDbClient();
    
    try {
        console.log("🔑 API Keys:");
        const keys = await client.query(`SELECT id, token, created_at FROM api_key WHERE type = 'publishable'`);
        keys.rows.forEach(k => console.log(`  ${k.id} (${k.token}) - ${k.created_at}`));
        
        console.log("\n🔗 Links:");
        const links = await client.query(`SELECT * FROM publishable_api_key_sales_channel`);
        links.rows.forEach(l => console.log(`  Link: ${l.publishable_key_id} -> ${l.sales_channel_id} (ID: ${l.id})`));
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

main();
