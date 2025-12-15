/**
 * Get Redis connection options from environment
 * Reused from payment-capture-queue.ts pattern since central redis.ts does not exist yet.
 */
export const getRedisConnection = () => {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        throw new Error("REDIS_URL is not configured");
    }

    // Parse Redis URL for connection options
    const url = new URL(redisUrl);
    return {
        host: url.hostname,
        port: parseInt(url.port || "6379"),
        password: url.password || undefined,
        username: url.username || undefined,
        tls: url.protocol === "rediss:" ? {} : undefined,
    };
};
