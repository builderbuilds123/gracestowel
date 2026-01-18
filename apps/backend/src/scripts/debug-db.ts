
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function checkTables() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL !== "false" ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    const resTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('Tables:', resTables.rows.map(r => r.table_name));

    // Check specific tables
    const tablesToCheck = ['store_locale', 'locale', 'store'];
    
    for (const table of tablesToCheck) {
        if (resTables.rows.find(r => r.table_name === table)) {
            console.log(`\nColumns for ${table}:`);
            const resCols = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = '${table}';
            `);
            console.table(resCols.rows);
        } else {
            console.log(`\nTable ${table} DOES NOT EXIST`);
        }
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

checkTables();
