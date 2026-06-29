import React, { useEffect, useMemo, useRef, useState } from 'react';
import StatCard from './components/StatCard.jsx';
import EventsPerMinuteChart from './components/EventsPerMinuteChart.jsx';
import EventsByTypeChart from './components/EventsByTypeChart.jsx';
import EventFeed from './components/EventFeed.jsx';

const FEED_LIMIT = 20;
const MINUTE_WINDOW = 60;

function formatMinuteKey(date) {
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function buildMinuteSeries(byMinute) {
  const now = new Date();
  const series = [];
  for (let i = MINUTE_WINDOW - 1; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 60_000);
    const key = formatMinuteKey(d);
    series.push({
      minute: key,
      count: Number(byMinute?.[key] || 0),
    });
  }
  return series;
}

function buildTypeSeries(byType) {
  if (!byType) return [];
  return Object.entries(byType)
    .map(([type, count]) => ({ type, count: Number(count) }))
    .sort((a, b) => b.count - a.count);
}

export default function Dashboard({ snapshot, latestEvent, statsTick }) {
  const [counters, setCounters] = useState({ total: 0, byType: {}, byMinute: {} });
  const [recent, setRecent] = useState([]);
  const [flashKey, setFlashKey] = useState(0);
  const lastFlashRef = useRef(0);

  useEffect(() => {
    if (snapshot?.counters) setCounters(snapshot.counters);
    if (snapshot?.recent) {
      const normalized = snapshot.recent.map((e) => ({
        id: e.id,
        type: e.type,
        userId: e.user_id ?? e.userId ?? null,
        metadata: e.metadata ?? {},
        createdAt: e.created_at ?? e.createdAt,
      }));
      setRecent(normalized);
    }
  }, [snapshot]);

  useEffect(() => {
    if (!statsTick?.counters) return;
    setCounters(statsTick.counters);
  }, [statsTick]);

  useEffect(() => {
    if (!latestEvent) return;

    setRecent((prev) => {
      const next = [latestEvent, ...prev.filter((e) => e.id !== latestEvent.id)];
      return next.slice(0, FEED_LIMIT);
    });

    setCounters((prev) => {
      const created = new Date(latestEvent.createdAt || Date.now());
      const minuteKey = formatMinuteKey(created);
      return {
        total: (prev.total || 0) + 1,
        byType: {
          ...prev.byType,
          [latestEvent.type]: (prev.byType?.[latestEvent.type] || 0) + 1,
        },
        byMinute: {
          ...prev.byMinute,
          [minuteKey]: (prev.byMinute?.[minuteKey] || 0) + 1,
        },
      };
    });

    const now = Date.now();
    if (now - lastFlashRef.current > 250) {
      lastFlashRef.current = now;
      setFlashKey((k) => k + 1);
    }
  }, [latestEvent]);

  const minuteSeries = useMemo(
    () => buildMinuteSeries(counters.byMinute),
    [counters.byMinute]
  );
  const typeSeries = useMemo(
    () => buildTypeSeries(counters.byType),
    [counters.byType]
  );

  const lastMinuteCount = minuteSeries[minuteSeries.length - 1]?.count || 0;
  const totalTypes = Object.keys(counters.byType || {}).length;

  return (
    <>
      <div className="grid stats-row">
        <StatCard
          title="Total Events"
          value={counters.total || 0}
          subtitle="all-time"
          flashKey={flashKey}
        />
        <StatCard
          title="Events / Last Minute"
          value={lastMinuteCount}
          subtitle={`current minute · UTC`}
        />
        <StatCard
          title="Distinct Types"
          value={totalTypes}
          subtitle="active in counters"
        />
        <StatCard
          title="Live Feed"
          value={recent.length}
          subtitle={`showing latest ${FEED_LIMIT}`}
        />
      </div>

      <div className="grid charts-row">
        <div className="card chart-card">
          <div className="card-header">
            <span className="card-title">Events Per Minute · Last 60</span>
            <span className="card-meta">UTC</span>
          </div>
          <EventsPerMinuteChart data={minuteSeries} />
        </div>

        <div className="card chart-card">
          <div className="card-header">
            <span className="card-title">Events By Type</span>
            <span className="card-meta">{typeSeries.length} types</span>
          </div>
          <EventsByTypeChart data={typeSeries} />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Live Event Feed</span>
          <span className="card-meta">latest {FEED_LIMIT}</span>
        </div>
        <EventFeed events={recent} />
      </div>
    </>
  );
}
