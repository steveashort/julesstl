import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { MetricRecord } from '../api';

interface Props {
  data: MetricRecord[];
  metricKey: string;
}

const MetricsChart: React.FC<Props> = ({ data, metricKey }) => {
  const filteredData = data.filter(d => d.key === metricKey && d.metric_type === 'gauge');

  if (filteredData.length === 0) return null;

  return (
    <div className="h-64 w-full">
      <h4 className="text-center font-semibold mb-2">{metricKey}</h4>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={filteredData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(time) => new Date(time).toLocaleTimeString()}
          />
          <YAxis />
          <Tooltip labelFormatter={(label) => new Date(label).toLocaleString()} />
          <Legend />
          <Line type="monotone" dataKey="value" stroke="#8884d8" activeDot={{ r: 8 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MetricsChart;
