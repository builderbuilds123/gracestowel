
import { Client } from 'pg';
import path from 'path';
import dotenv from 'dotenv';

// Configure dotenv to read from backend root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const CONFIG = {
    API_URL: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000",
    DB_URL: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/medusa-gracestowel",
    // Default test variant used in reproduction scripts
    TEST_VARIANT_ID: "variant_01KCQ89AYX36XYB5NZQGQ8EHW2"
};

export async function getDbClient() {
    const client = new Client({
        connectionString: CONFIG.DB_URL,
        ssl: CONFIG.DB_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });
    await client.connect();
    return client;
}

export async function getPublishableApiKey(client: Client): Promise<string> {
    const res = await client.query(`SELECT token FROM api_key WHERE type = 'publishable' ORDER BY created_at DESC LIMIT 1`);
    if (res.rows.length === 0) {
        throw new Error("No publishable API key found in database");
    }
    return res.rows[0].token;
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
