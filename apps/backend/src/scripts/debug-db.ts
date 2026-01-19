
/* eslint-disable es/no-modules, es/no-async-functions, es/no-block-scoping */
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

type TableRow = { table_name: string };
type ColumnRow = { column_name: string; data_type: string };

async function checkTables(): Promise<void> {
  const sslEnabled = process.env.DATABASE_SSL !== "false";
  const allowInsecure = process.env.DATABASE_SSL_ALLOW_INSECURE === "true";

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: sslEnabled ? { rejectUnauthorized: !allowInsecure } : false
  });
  if (sslEnabled && allowInsecure) {
    console.warn("DATABASE_SSL_ALLOW_INSECURE=true: TLS verification is disabled for this debug script.");
  }

  try {
    await client.connect();
    console.log('Connected to DB');

    const resTables = await client.query<TableRow>(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('Tables:', resTables.rows.map((row) => row.table_name));

    // Check specific tables
    const tablesToCheck = ['store_locale', 'locale', 'store'];
    
    for (const tableName of tablesToCheck) {
        const hasTable = resTables.rows.some((row) => row.table_name === tableName);
        if (hasTable) {
            console.log(`\nColumns for ${tableName}:`);
            const resCols = await client.query<ColumnRow>(
                `SELECT column_name, data_type 
                 FROM information_schema.columns 
                 WHERE table_name = $1;`,
                [tableName]
            );
            console.table(resCols.rows);
        } else {
            console.log(`\nTable ${tableName} DOES NOT EXIST`);
        }
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

checkTables();
