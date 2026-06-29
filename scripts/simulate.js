/* eslint-disable no-console */
const TARGET = process.env.TARGET || 'http://localhost:3001/api/events';
const RATE = Number(process.env.RATE || 100); // events per second
const DURATION_MS = Number(process.env.DURATION_MS || 0); // 0 = forever
const CONCURRENCY = Number(process.env.CONCURRENCY || 16);

const TYPES = ['click', 'pageview', 'signup', 'purchase', 'error', 'logout'];
const PAGES = ['/', '/pricing', '/docs', '/blog', '/login', '/signup', '/dashboard'];
const REFERRERS = ['google', 'twitter', 'direct', 'newsletter', 'github', 'reddit'];
const COUNTRIES = ['US', 'IN', 'DE', 'GB', 'JP', 'BR', 'FR', 'CA'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomUserId() {
  return `u_${Math.floor(Math.random() * 5000)}`;
}

function buildEvent() {
  const type = pick(TYPES);
  const metadata = {
    page: pick(PAGES),
    referrer: pick(REFERRERS),
    country: pick(COUNTRIES),
    sessionId: `s_${Math.floor(Math.random() * 10000)}`,
  };
  if (type === 'purchase') {
    metadata.amount = Math.round(Math.random() * 50000) / 100;
    metadata.currency = 'USD';
  }
  if (type === 'error') {
    metadata.code = pick(['E_TIMEOUT', 'E_VALIDATE', 'E_AUTH', 'E_500']);
  }
  return {
    type,
    userId: randomUserId(),
    metadata,
    timestamp: new Date().toISOString(),
  };
}

if (typeof fetch !== 'function') {
  console.error('Node 18+ is required (global fetch).');
  process.exit(1);
}

const stats = {
  sent: 0,
  ok: 0,
  fail: 0,
  startedAt: Date.now(),
  intervalSent: 0,
  intervalOk: 0,
  intervalFail: 0,
};

let stopped = false;

async function postOne(payload) {
  try {
    const res = await fetch(TARGET, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok || res.status === 202) {
      stats.ok += 1;
      stats.intervalOk += 1;
    } else {
      stats.fail += 1;
      stats.intervalFail += 1;
    }
  } catch {
    stats.fail += 1;
    stats.intervalFail += 1;
  }
}

async function worker(queue) {
  while (!stopped) {
    const next = queue.shift();
    if (!next) {
      await new Promise((r) => setTimeout(r, 5));
      continue;
    }
    await postOne(next);
  }
}

async function main() {
  console.log(`[sim] target=${TARGET} rate=${RATE}/s concurrency=${CONCURRENCY}`);

  const queue = [];
  const workers = Array.from({ length: CONCURRENCY }, () => worker(queue));

  const intervalMs = 1000;
  const ticker = setInterval(() => {
    for (let i = 0; i < RATE; i += 1) {
      queue.push(buildEvent());
      stats.sent += 1;
      stats.intervalSent += 1;
    }
  }, intervalMs);

  const reporter = setInterval(() => {
    const elapsed = ((Date.now() - stats.startedAt) / 1000).toFixed(0);
    console.log(
      `[sim] t=${elapsed}s  sent=${stats.intervalSent}/s  ok=${stats.intervalOk}  fail=${stats.intervalFail}  total=${stats.sent}  pending=${queue.length}`
    );
    stats.intervalSent = 0;
    stats.intervalOk = 0;
    stats.intervalFail = 0;
  }, 1000);

  if (DURATION_MS > 0) {
    setTimeout(async () => {
      stopped = true;
      clearInterval(ticker);
      clearInterval(reporter);
      await Promise.all(workers);
      const elapsed = ((Date.now() - stats.startedAt) / 1000).toFixed(1);
      console.log(`[sim] done t=${elapsed}s sent=${stats.sent} ok=${stats.ok} fail=${stats.fail}`);
      process.exit(0);
    }, DURATION_MS);
  }

  const onShutdown = async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(ticker);
    clearInterval(reporter);
    console.log('\n[sim] stopping...');
    await Promise.all(workers);
    const elapsed = ((Date.now() - stats.startedAt) / 1000).toFixed(1);
    console.log(`[sim] done t=${elapsed}s sent=${stats.sent} ok=${stats.ok} fail=${stats.fail}`);
    process.exit(0);
  };
  process.on('SIGINT', onShutdown);
  process.on('SIGTERM', onShutdown);
}

main().catch((err) => {
  console.error('[sim] fatal:', err);
  process.exit(1);
});
