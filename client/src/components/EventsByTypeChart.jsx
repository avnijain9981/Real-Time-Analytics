import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';

const COLORS = {
  click: '#60a5fa',
  pageview: '#4ade80',
  signup: '#c084fc',
  purchase: '#fb923c',
  error: '#f87171',
  logout: '#94a3b8',
};

function colorFor(type) {
  if (COLORS[type]) return COLORS[type];
  let hash = 0;
  for (let i = 0; i < type.length; i += 1) {
    hash = (hash * 31 + type.charCodeAt(i)) | 0;
  }
  const palette = ['#22d3ee', '#f472b6', '#fbbf24', '#a3e635', '#818cf8'];
  return palette[Math.abs(hash) % palette.length];
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="tooltip">
      <div className="label">{item.type}</div>
      <div>{item.count.toLocaleString()} events</div>
    </div>
  );
}

export default function EventsByTypeChart({ data }) {
  if (!data?.length) {
    return <div className="empty-state">awaiting events...</div>;
  }
  return (
    <div className="chart-wrapper">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
          layout="vertical"
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            tickLine={false}
            axisLine={{ stroke: '#232a33' }}
          />
          <YAxis
            type="category"
            dataKey="type"
            tickLine={false}
            axisLine={{ stroke: '#232a33' }}
            width={80}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1a1f26' }} />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.type} fill={colorFor(d.type)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
