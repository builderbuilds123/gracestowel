
import { Client } from 'pg';

const connectionString = "postgresql://leonliang@localhost:5432/medusa";

async function run() {
    const client = new Client({ connectionString });
    await client.connect();

    try {
        // Select one raw order_item
        const itemsRes = await client.query(`
            SELECT *
            FROM "order_item"
            LIMIT 1
        `);

        if (itemsRes.rows.length === 0) {
            console.log("No items found in order_item");
        } else {
            console.log("First Raw Order Item:", JSON.stringify(itemsRes.rows[0], null, 2));
        }

    } catch (err) {
        console.error("Error executing query", err);
    } finally {
        await client.end();
    }
}

run();
