import { Client } from "pg";

/**
 * Returns a PostgreSQL client based on the environment.
 * In production (when Hyperdrive is configured) we will later switch to that.
 * For now it always uses the `DATABASE_URL` environment variable.
 */
export const getDbClient = async (context: any) => {
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error("DATABASE_URL not set – ensure .dev.vars is configured");
    }
    const client = new Client({ connectionString: url });
    await client.connect();
    console.log("⚠️ Using Direct Dev Connection (No Hyperdrive)");
    return client;
};
