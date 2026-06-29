require('dotenv').config();
const IORedis = require('ioredis');
const { Queue, QueueEvents } = require('bullmq');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const bullConnectionOpts = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

function createBullConnection() {
  return new IORedis(REDIS_URL, bullConnectionOpts);
}

const sharedRedis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: 5,
});

sharedRedis.on('error', (err) => {
  console.error('[redis] error:', err.message);
});

const QUEUE_NAME = 'events';

const eventsQueue = new Queue(QUEUE_NAME, {
  connection: createBullConnection(),
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 500,
    attempts: 3,
    backoff: { type: 'exponential', delay: 500 },
  },
});

const eventsQueueEvents = new QueueEvents(QUEUE_NAME, {
  connection: createBullConnection(),
});

eventsQueueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`[queue] job ${jobId} failed: ${failedReason}`);
});

const COUNTER_KEYS = {
  total: 'counter:total',
  type: (type) => `counter:type:${type}`,
  minute: (hhmm) => `counter:minute:${hhmm}`,
};

function formatMinute(date = new Date()) {
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function incrementCounters({ type, when }) {
  const minuteKey = COUNTER_KEYS.minute(formatMinute(when));
  const pipeline = sharedRedis.multi();
  pipeline.incr(COUNTER_KEYS.total);
  pipeline.incr(COUNTER_KEYS.type(type));
  pipeline.incr(minuteKey);
  pipeline.expire(minuteKey, 60 * 60 * 24);
  await pipeline.exec();
}

async function readCounters() {
  const total = await sharedRedis.get(COUNTER_KEYS.total);

  const typeKeys = await sharedRedis.keys('counter:type:*');
  const byType = {};
  if (typeKeys.length) {
    const values = await sharedRedis.mget(...typeKeys);
    typeKeys.forEach((key, idx) => {
      const type = key.replace('counter:type:', '');
      byType[type] = Number(values[idx] || 0);
    });
  }

  const minuteKeys = await sharedRedis.keys('counter:minute:*');
  const byMinute = {};
  if (minuteKeys.length) {
    const values = await sharedRedis.mget(...minuteKeys);
    minuteKeys.forEach((key, idx) => {
      const minute = key.replace('counter:minute:', '');
      byMinute[minute] = Number(values[idx] || 0);
    });
  }

  return {
    total: Number(total || 0),
    byType,
    byMinute,
  };
}

async function shutdown() {
  await Promise.allSettled([
    eventsQueue.close(),
    eventsQueueEvents.close(),
    sharedRedis.quit(),
  ]);
}

module.exports = {
  REDIS_URL,
  QUEUE_NAME,
  createBullConnection,
  sharedRedis,
  eventsQueue,
  eventsQueueEvents,
  incrementCounters,
  readCounters,
  formatMinute,
  shutdown,
};
