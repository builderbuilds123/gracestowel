
import { getDbClient } from "./utils";

async function main() {
    const client = await getDbClient();
    
    try {
        const res = await client.query(`
            SELECT table_name, column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name IN ('api_key', 'publishable_api_key_sales_channel')
            ORDER BY table_name, ordinal_position;
        `);
        
        console.log("📊 Table Columns:");
        res.rows.forEach(r => {
            console.log(`${r.table_name}.${r.column_name} (${r.data_type}) nullable: ${r.is_nullable}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

main();
