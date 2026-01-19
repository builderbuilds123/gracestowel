import { Client } from "pg";

interface CloudflareContext {
    cloudflare?: {
        env?: {
            HYPERDRIVE?: {
                connectionString: string;
            };
            DATABASE_URL?: string;
        };
    };
}

/**
 * Returns a PostgreSQL client based on the environment.
 * In production, uses Hyperdrive for accelerated connections.
 * In development, falls back to DATABASE_URL from .dev.vars.
 */
export const getDbClient = async (context: CloudflareContext) => {
    // Check for Hyperdrive binding first (production on Cloudflare Workers)
    const hyperdrive = context?.cloudflare?.env?.HYPERDRIVE;

    if (hyperdrive?.connectionString) {
        const client = new Client({ connectionString: hyperdrive.connectionString });
        await client.connect();
        console.log("✅ Using Hyperdrive accelerated connection");
        return client;
    }

    // Fallback to direct connection (local development)
    const url = context?.cloudflare?.env?.DATABASE_URL || import.meta.env.DATABASE_URL;
    if (!url) {
        throw new Error("DATABASE_URL not set – ensure .dev.vars is configured or Hyperdrive is bound");
    }

    const client = new Client({ connectionString: url });
    await client.connect();
    console.log("⚠️ Using Direct Dev Connection (No Hyperdrive)");
    return client;
};
