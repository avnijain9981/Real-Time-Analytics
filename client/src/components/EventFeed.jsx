import React from 'react';

const KNOWN_TYPES = new Set([
  'click',
  'pageview',
  'signup',
  'purchase',
  'error',
  'logout',
]);

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function summarize(metadata) {
  if (!metadata || typeof metadata !== 'object') return '';
  const parts = [];
  for (const [k, v] of Object.entries(metadata)) {
    if (parts.length >= 3) break;
    if (v == null) continue;
    const str = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (str.length > 40) {
      parts.push(`${k}=${str.slice(0, 40)}…`);
    } else {
      parts.push(`${k}=${str}`);
    }
  }
  return parts.join(' · ');
}

export default function EventFeed({ events }) {
  if (!events?.length) {
    return <div className="empty-state">no events yet — fire up the simulator</div>;
  }
  return (
    <div className="feed">
      {events.map((e) => {
        const badgeClass = KNOWN_TYPES.has(e.type) ? e.type : '';
        const meta = summarize(e.metadata);
        return (
          <div key={e.id} className="feed-row">
            <span className={`badge ${badgeClass}`}>{e.type}</span>
            <span className="feed-meta" title={meta}>
              {e.userId ? `user=${e.userId}` : 'anon'}
              {meta ? `  ·  ${meta}` : ''}
            </span>
            <span className="feed-time">{formatTime(e.createdAt)}</span>
          </div>
        );
      })}
    </div>
  );
}
