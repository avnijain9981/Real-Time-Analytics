require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  console.error('[db] unexpected pool error:', err);
});

const SCHEMA_SQL = `
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL,
    user_id VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
  CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
`;

async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query(SCHEMA_SQL);
    console.log('[db] schema ready');
  } finally {
    client.release();
  }
}

async function insertEvent({ type, userId, metadata, createdAt }) {
  const text = `
    INSERT INTO events (type, user_id, metadata, created_at)
    VALUES ($1, $2, $3, COALESCE($4, NOW()))
    RETURNING id, type, user_id, metadata, created_at
  `;
  const values = [type, userId || null, metadata || {}, createdAt || null];
  const { rows } = await pool.query(text, values);
  return rows[0];
}

async function getRecentEvents(limit = 20) {
  const { rows } = await pool.query(
    `SELECT id, type, user_id, metadata, created_at
     FROM events
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function getCountsByType() {
  const { rows } = await pool.query(
    `SELECT type, COUNT(*)::int AS count
     FROM events
     GROUP BY type
     ORDER BY count DESC`
  );
  return rows;
}

async function getEventsPerMinute(minutes = 60) {
  const { rows } = await pool.query(
    `SELECT
       date_trunc('minute', created_at) AS minute,
       COUNT(*)::int AS count
     FROM events
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 minute')
     GROUP BY minute
     ORDER BY minute ASC`,
    [minutes]
  );
  return rows;
}

async function getTotalCount() {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM events`);
  return rows[0].count;
}

module.exports = {
  pool,
  initSchema,
  insertEvent,
  getRecentEvents,
  getCountsByType,
  getEventsPerMinute,
  getTotalCount,
};
