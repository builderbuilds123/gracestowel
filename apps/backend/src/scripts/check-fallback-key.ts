
import { getDbClient } from "./utils";

const FALLBACK_KEY = "pk_01JEX3N7J6A2A8Z5P8X4Q9W9V1";

async function main() {
    const client = await getDbClient();
    
    try {
        // 1. Check Key
        const keyRes = await client.query(`SELECT id, token FROM api_key WHERE token = $1`, [FALLBACK_KEY]);
        if (keyRes.rows.length === 0) {
            console.log("❌ Fallback key NOT found in api_key table.");
        } else {
            const keyId = keyRes.rows[0].id;
            console.log(`✅ Fallback key found: ${keyId}`);
            
            // 2. Check Link
            const linkRes = await client.query(`SELECT id FROM publishable_api_key_sales_channel WHERE publishable_key_id = $1`, [keyId]);
            if (linkRes.rows.length === 0) {
                console.log("❌ Fallback key NOT linked to any sales channel.");
                
                // Link it!
                const scRes = await client.query(`SELECT id FROM sales_channel WHERE is_disabled = false LIMIT 1`);
                const scId = scRes.rows[0].id;
                const linkId = `pksc_${Date.now()}`;
                
                await client.query(`
                    INSERT INTO publishable_api_key_sales_channel (id, publishable_key_id, sales_channel_id, created_at, updated_at)
                    VALUES ($1, $2, $3, NOW(), NOW())
                `, [linkId, keyId, scId]);
                console.log("✅ Linked fallback key to default sales channel.");
            } else {
                console.log("✅ Fallback key ALREADY linked.");
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

main();
