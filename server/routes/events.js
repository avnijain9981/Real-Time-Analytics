const express = require('express');
const { eventsQueue } = require('../redis');

const router = express.Router();

const VALID_TYPE_RE = /^[a-zA-Z0-9_\-:.]{1,100}$/;

function validatePayload(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'body_must_be_object' };
  }
  const { type, userId, metadata, timestamp } = body;

  if (typeof type !== 'string' || !VALID_TYPE_RE.test(type)) {
    return { ok: false, error: 'invalid_type' };
  }
  if (userId != null && (typeof userId !== 'string' || userId.length > 100)) {
    return { ok: false, error: 'invalid_userId' };
  }
  if (metadata != null && (typeof metadata !== 'object' || Array.isArray(metadata))) {
    return { ok: false, error: 'invalid_metadata' };
  }
  let ts = null;
  if (timestamp != null) {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: 'invalid_timestamp' };
    }
    ts = parsed.toISOString();
  }

  return {
    ok: true,
    payload: {
      type,
      userId: userId || null,
      metadata: metadata || {},
      timestamp: ts,
    },
  };
}

router.post('/', async (req, res) => {
  const result = validatePayload(req.body);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }

  try {
    const job = await eventsQueue.add('event', result.payload, {
      removeOnComplete: 1000,
      removeOnFail: 500,
    });
    return res.status(202).json({ accepted: true, jobId: job.id });
  } catch (err) {
    console.error('[events] enqueue failed:', err);
    return res.status(500).json({ error: 'enqueue_failed' });
  }
});

module.exports = router;
