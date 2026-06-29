import React, { useEffect, useRef, useState } from 'react';

function useAnimatedNumber(value, duration = 400) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const from = fromRef.current;
    const to = value;
    if (from === to) return undefined;

    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    };
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, duration]);

  return display;
}

export default function StatCard({ title, value, subtitle, flashKey }) {
  const animated = useAnimatedNumber(Number(value) || 0);
  const [flashing, setFlashing] = useState(false);
  const lastFlashRef = useRef(flashKey);

  useEffect(() => {
    if (flashKey == null) return;
    if (flashKey === lastFlashRef.current) return;
    lastFlashRef.current = flashKey;
    setFlashing(true);
    const t = setTimeout(() => setFlashing(false), 600);
    return () => clearTimeout(t);
  }, [flashKey]);

  return (
    <div className={`card stat-card ${flashing ? 'flash' : ''}`}>
      <div className="card-header">
        <span className="card-title">{title}</span>
      </div>
      <div className="stat-value">{animated.toLocaleString()}</div>
      {subtitle && <div className="stat-sub">{subtitle}</div>}
    </div>
  );
}
