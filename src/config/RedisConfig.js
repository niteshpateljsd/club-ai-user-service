const Redis = require("ioredis");
const logger = require("../utils/logger"); // adjust path if needed

let client = null;

try {
    client = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
        maxRetriesPerRequest: 1, // don't block requests forever
        retryStrategy: () => null // ❌ stop retrying if connection fails
    });

    client.on("connect", () => {
        logger.info("Redis connected successfully");
    });

    client.on("ready", () => {
        logger.info("Redis ready to use");
    });

    client.on("error", (error) => {
        logger.warn(`Redis connection failed (optional): ${error.message}`);
    });

    client.on("close", () => {
        logger.warn("Redis connection closed");
    });

} catch (error) {
    logger.warn(`Redis initialization failed (optional): ${error.message}`);
    client = null;
}

module.exports = client;