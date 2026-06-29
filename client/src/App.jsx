import React, { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import Dashboard from './Dashboard.jsx';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

export default function App() {
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState({ counters: null, recent: [] });
  const [latestEvent, setLatestEvent] = useState(null);
  const [statsTick, setStatsTick] = useState(null);

const socket = useMemo(
  () =>
    io(SOCKET_URL, {
      transports: ['polling', 'websocket'],
    }),
  []
);
  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('stats:snapshot', (data) => setSnapshot(data));
    socket.on('event:new', (evt) => setLatestEvent(evt));
    socket.on('stats:update', (payload) => setStatsTick(payload));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [socket]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>// REAL-TIME ANALYTICS</h1>
          <span className="tag">events · counters · live feed</span>
        </div>
        <div className="connection">
          <span className={`dot ${connected ? 'connected' : ''}`} />
          {connected ? 'live' : 'connecting...'}
        </div>
      </header>

      <Dashboard
        snapshot={snapshot}
        latestEvent={latestEvent}
        statsTick={statsTick}
      />

      <div className="footer-note">
        socket.io · bullmq · postgres · redis · recharts
      </div>
    </div>
  );
}
