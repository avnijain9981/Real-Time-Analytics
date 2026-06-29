require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { Server } = require('socket.io');
const IORedis = require('ioredis');

const { initSchema, getRecentEvents } = require('./db');
const {
  REDIS_URL,
  readCounters,
  shutdown: shutdownRedis,
} = require('./redis');
const eventsRouter = require('./routes/events');

const PORT = Number(process.env.PORT || 3001);

async function main() {
  await initSchema();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));
  app.use(morgan('tiny'));

  app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

  app.use('/api/events', eventsRouter);

  app.get('/api/stats', async (_req, res) => {
    try {
      const [counters, recent] = await Promise.all([
        readCounters(),
        getRecentEvents(20),
      ]);
      res.json({ counters, recent });
    } catch (err) {
      console.error('[stats] error:', err);
      res.status(500).json({ error: 'stats_failed' });
    }
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "http://localhost:5173",
      credentials: true
    },
  });

  io.on('connection', async (socket) => {
    console.log(`[socket] connected ${socket.id}`);
    try {
      const [counters, recent] = await Promise.all([
        readCounters(),
        getRecentEvents(20),
      ]);
      socket.emit('stats:snapshot', { counters, recent });
    } catch (err) {
      console.error('[socket] snapshot error:', err);
    }
    socket.on('disconnect', () => {
      console.log(`[socket] disconnected ${socket.id}`);
    });
  });

  // Listen for cross-process worker broadcasts via Redis pub/sub
  const subscriber = new IORedis(REDIS_URL);
  subscriber.subscribe('events:new', (err) => {
    if (err) console.error('[pubsub] subscribe error:', err);
    else console.log('[pubsub] subscribed to events:new');
  });
  subscriber.on('message', (channel, message) => {
    if (channel !== 'events:new') return;
    try {
      const payload = JSON.parse(message);
      io.emit('event:new', payload);
    } catch (err) {
      console.error('[pubsub] parse error:', err);
    }
  });

  // Periodic stats snapshot every 5s
  const statsInterval = setInterval(async () => {
    try {
      const counters = await readCounters();
      io.emit('stats:update', { counters, ts: Date.now() });
    } catch (err) {
      console.error('[stats:update] error:', err);
    }
  }, 5000);

  server.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
  });

  const cleanShutdown = async (signal) => {
    console.log(`\n[server] received ${signal}, shutting down...`);
    clearInterval(statsInterval);
    io.close();
    server.close();
    await subscriber.quit().catch(() => {});
    await shutdownRedis();
    process.exit(0);
  };

  process.on('SIGINT', () => cleanShutdown('SIGINT'));
  process.on('SIGTERM', () => cleanShutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[server] fatal:', err);
  process.exit(1);
});
