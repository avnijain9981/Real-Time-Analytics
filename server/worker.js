require('dotenv').config();
const { Worker } = require('bullmq');
const IORedis = require('ioredis');

const { initSchema, insertEvent, pool } = require('./db');
const {
  QUEUE_NAME,
  REDIS_URL,
  createBullConnection,
  incrementCounters,
  shutdown: shutdownRedis,
} = require('./redis');

async function main() {
  await initSchema();

  const publisher = new IORedis(REDIS_URL);

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { type, userId, metadata, timestamp } = job.data || {};
      const when = timestamp ? new Date(timestamp) : new Date();

      const persisted = await insertEvent({
        type,
        userId,
        metadata,
        createdAt: when.toISOString(),
      });

      await incrementCounters({ type, when });

      const payload = {
        id: persisted.id,
        type: persisted.type,
        userId: persisted.user_id,
        metadata: persisted.metadata,
        createdAt: persisted.created_at,
      };

      // Cross-process broadcast: server/index.js subscribes and emits via Socket.io
      await publisher.publish('events:new', JSON.stringify(payload));

      return payload;
    },
    {
      connection: createBullConnection(),
      concurrency: Number(process.env.WORKER_CONCURRENCY || 10),
    }
  );

  worker.on('ready', () => console.log(`[worker] ready, queue=${QUEUE_NAME}`));
  worker.on('completed', (job) => {
    if (Number(job.id) % 100 === 0) {
      console.log(`[worker] processed job ${job.id}`);
    }
  });
  worker.on('failed', (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err.message);
  });
  worker.on('error', (err) => {
    console.error('[worker] error:', err.message);
  });

  const cleanShutdown = async (signal) => {
    console.log(`\n[worker] received ${signal}, shutting down...`);
    try {
      await worker.close();
      await publisher.quit();
      await shutdownRedis();
      await pool.end();
    } catch (err) {
      console.error('[worker] shutdown error:', err);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => cleanShutdown('SIGINT'));
  process.on('SIGTERM', () => cleanShutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
