/**
 * Get Redis connection options from environment
 * Centralized Redis connection configuration with error handling and validation.
 * 
 * @returns Redis connection configuration object
 * @throws Error if REDIS_URL is not configured or invalid
 */
export const getRedisConnection = () => {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        throw new Error("REDIS_URL is not configured");
    }

    try {
        // Parse Redis URL for connection options
        const url = new URL(redisUrl);
        
        const port = parseInt(url.port || "6379", 10);
        if (isNaN(port) || port < 1 || port > 65535) {
            throw new Error(`Invalid Redis port: ${url.port}`);
        }

        return {
            host: url.hostname,
            port,
            password: url.password || undefined,
            username: url.username || undefined,
            tls: url.protocol === "rediss:" ? {} : undefined,
            // Add retry strategy for connection resilience
            retryStrategy: (times: number) => {
                // Exponential backoff: 50ms, 100ms, 200ms, 400ms, 800ms, max 3s
                const delay = Math.min(times * 50, 3000);
                if (times > 10) {
                    // Stop retrying after 10 attempts to prevent infinite loops
                    return null;
                }
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: false,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (error instanceof TypeError && error.message.includes("Invalid URL")) {
            throw new Error(`Invalid REDIS_URL format: ${redisUrl}. Error: ${errorMessage}`);
        }
        throw new Error(`Failed to parse REDIS_URL: ${errorMessage}`);
    }
};
