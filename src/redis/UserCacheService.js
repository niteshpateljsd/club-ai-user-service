const redis = require("../config/RedisConfig");
const axios = require("axios");
const logger = require("../utils/logger");

const USER_CACHE_TTL = 3600; // 1 hour

/**
 * Fetch user info (cache first, then fallback to user-service)
 */
async function getUser(userId) {
  if (!userId) {
    logger.warn("⚠️ getUser called with empty userId");
    return null;
  }

  try {
    const cached = await redis.get(`user:${userId}`);
    if (cached) {
      logger.info(`✅ Redis hit for user:${userId}`);
      return JSON.parse(cached);
    }
    logger.info(`ℹ️ Redis miss for user:${userId}, fetching from user-service...`);

    const response = await axios.get(
      `http://localhost:4002/users/getProfile?id=${userId}`
    );

    if (response.data?.responseCode === 200) {
      const user = response.data.responseBody;
      await cacheUser(user);
      return user;
    }
  } catch (err) {
    logger.error(`❌ getUser error for user:${userId} → ${err.message}`);
  }

  return null;
}

/**
 * Cache user in Redis
 */
async function cacheUser(user) {
  if (!user || !user.id) return;

  const redisKey = `user:${user.id}`;
  try {
    const cached = await redis.get(redisKey);

    if (cached) {
      const existingUser = JSON.parse(cached);
      const existingTime = new Date(existingUser.updatedAt).getTime();
      const newTime = new Date(user.updatedAt).getTime();

    //   if (newTime <= existingTime) {
    //     logger.warn(
    //       `⚠️ Ignored outdated user cache update for userId=${user.id}`
    //     );
    //     return;
    //   }
    }

    //await redis.set(redisKey, JSON.stringify(user), "EX", USER_CACHE_TTL);
    await redis.persist(redisKey); // make permanent
    await redis.set(redisKey, JSON.stringify(user)); // replace with new data

    logger.info(`✅ Cached latest user in Redis userId=${user.id}`);
  } catch (err) {
    logger.error(
      `❌ Failed to cache user in Redis userId=${user?.id || "unknown"}, error=${err.message}`
    );
  }
}

/**
 * Remove user from Redis cache
 */
async function removeUser(userId) {
  await redis.del(`user:${userId}`);
  logger.info(`🗑️ Removed user:${userId} from Redis`);
}

/**
 * Fetch multiple users by IDs (optimized for Redis)
 * @param {Array<String>} userIds
 * @returns {Array<Object>}
 */
async function getAllUsersByIds(userIds = []) {
  if (!userIds.length) return [];

  try {
    const redisKeys = userIds.map((id) => `user:${id}`);
    const cachedUsers = await redis.mget(redisKeys);

    let result = [];
    let missingIds = [];

    cachedUsers.forEach((user, idx) => {
      if (user) {
        result.push(JSON.parse(user));
      } else {
        missingIds.push(userIds[idx]);
      }
    });

    if (missingIds.length > 0) {
      try{
          logger.info(
            `Fetching ${missingIds.length} users from user-service...`
          );

          const response = await axios.post(
            `http://localhost:4002/users/bulkGetProfiles`,
            { ids: missingIds }
          );

          if (response.data?.responseCode === 200) {
            const fetchedUsers = response.data.responseBody || [];
            result = [...result, ...fetchedUsers];

            // cache them
            for (const user of fetchedUsers) {
              await cacheUser(user);
            }
          }
      }catch(err){
        logger.error(`❌ getAllUsersByIds error → ${err.message}`);
      }
    }

    return result;
  } catch (err) {
    logger.error(`❌ getAllUsersByIds error → ${err.message}`);
    return [];
  }
}

/**
 * Search users by a list of userIds and searchText (cache only)
 * @param {Array<String>} userIds
 * @param {String} searchText
 * @returns {Array<Object>} matched users
 */
async function searchUsersByIdsAndText(userIds = [], searchText = "") {
  if (!userIds.length || !searchText.trim()) return [];

  try {
    // 1️⃣ Batch fetch from Redis
    const redisKeys = userIds.map((id) => `user:${id}`);
    const cachedUsers = await redis.mget(redisKeys);

    const users = cachedUsers
      .filter(Boolean) // remove nulls
      .map((u) => JSON.parse(u));

    // 2️⃣ Filter by searchText (case-insensitive)
    const regex = new RegExp(searchText.trim(), "i");
    const filtered = users.filter(
      (u) => regex.test(u.name || "") || regex.test(u.username || "")
    );

    return filtered;
  } catch (err) {
    logger.error(
      `❌ searchUsersByIdsAndText error → ${err.message}`,
      { userIds, searchText }
    );
    return [];
  }
}


module.exports = {
  cacheUser,
  getUser,
  removeUser,
  getAllUsersByIds,
  searchUsersByIdsAndText,
};
