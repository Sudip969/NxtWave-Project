const { createClient } = require('redis');

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redisClient = createClient({
  url: redisUrl
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err.message);
});

redisClient.on('connect', () => {
  console.log('Redis Client connected successfully.');
});

let isRedisConnected = false;

const connectRedis = async () => {
  if (process.env.NODE_ENV === 'test') {
    // Skip Redis connection during testing to avoid blocking jest
    console.log('Skipping Redis connection in test environment.');
    return;
  }
  try {
    await redisClient.connect();
    isRedisConnected = true;
  } catch (err) {
    console.error('Could not connect to Redis, proceeding without caching:', err.message);
    isRedisConnected = false;
  }
};

module.exports = {
  redisClient,
  connectRedis,
  getIsRedisConnected: () => isRedisConnected && redisClient.isOpen
};
