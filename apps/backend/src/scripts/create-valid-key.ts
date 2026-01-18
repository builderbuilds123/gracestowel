
import { getDbClient } from "./utils";

async function main() {
    const client = await getDbClient();
    
    try {
        // 1. Get Default Sales Channel
        const scRes = await client.query(`SELECT id FROM sales_channel WHERE is_disabled = false LIMIT 1`);
        if (scRes.rows.length === 0) throw new Error("No sales channel found");
        const scId = scRes.rows[0].id;
        
        // 2. Create API Key
        const keyId = `apk_mock_${Date.now()}`;
        const token = `test_pk_${Date.now()}`;
        
        await client.query(`
            INSERT INTO api_key (id, token, type, title, created_by, created_at, updated_at, salt, redacted)
            VALUES ($1, $2, 'publishable', 'Test Key', 'system', NOW(), NOW(), 'dummy_salt', $3)
        `, [keyId, token, token.slice(-4)]);
        
        // 3. Link to Sales Channel
        const linkId = `pksc_${Date.now()}`;
        await client.query(`
            INSERT INTO publishable_api_key_sales_channel (id, publishable_key_id, sales_channel_id)
            VALUES ($1, $2, $3)
        `, [linkId, keyId, scId]);
        
        console.log(`✅ Created Key: ${keyId}`);
        console.log(`🔑 Token: ${token}`);
    
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

main();
