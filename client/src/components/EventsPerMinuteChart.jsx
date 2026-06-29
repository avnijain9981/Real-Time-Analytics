import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  ComposedChart,
} from 'recharts';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip">
      <div className="label">{label} UTC</div>
      <div>{payload[0].value} events</div>
    </div>
  );
}

export default function EventsPerMinuteChart({ data }) {
  const ticks = data
    .filter((_, i) => i % 10 === 0)
    .map((d) => d.minute);

  return (
    <div className="chart-wrapper">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="epmFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4ade80" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#4ade80" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="minute"
            ticks={ticks}
            tickLine={false}
            axisLine={{ stroke: '#232a33' }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={{ stroke: '#232a33' }}
            width={36}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#2f3845' }} />
          <Area
            type="monotone"
            dataKey="count"
            stroke="none"
            fill="url(#epmFill)"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#4ade80"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
