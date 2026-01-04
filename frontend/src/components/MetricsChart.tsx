import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts';
import { MetricRecord } from '../api';

interface Props {
  data: MetricRecord[];
  metricKey: string;
  domain: [number | 'dataMin', number | 'dataMax'];
  onZoom: (left: number, right: number) => void;
}

const MetricsChart: React.FC<Props> = ({ data, metricKey, domain, onZoom }) => {
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);

  const filteredData = useMemo(() => data
    .filter(d => d.key === metricKey && d.metric_type === 'gauge')
    .map(d => ({
        ...d,
        value: Number(d.value),
        timeNum: new Date(d.timestamp).getTime()
    }))
    .filter(d => !isNaN(d.value) && !isNaN(d.timeNum)), [data, metricKey]);

  const thresholds = useMemo(() => {
    if (filteredData.length === 0) return { greenMax: 0, yellowMax: 0 };
    const last = [...filteredData].reverse().find(d => (d.green_if?.length || 0) > 0 || (d.yellow_if?.length || 0) > 0);
    
    const parse = (rules: string[] = []) => {
        let max = 0;
        for (const r of rules) {
            if (r.includes(':')) {
                const val = parseFloat(r.split(':')[1]);
                if (!isNaN(val) && val > max) max = val;
            }
        }
        return max;
    };

    return {
        greenMax: parse(last?.green_if),
        yellowMax: parse(last?.yellow_if)
    };
  }, [filteredData]);

  if (filteredData.length === 0) return null;

  const currentMin = typeof domain[0] === 'number' ? domain[0] : Math.min(...filteredData.map(d => d.timeNum));
  const currentMax = typeof domain[1] === 'number' ? domain[1] : Math.max(...filteredData.map(d => d.timeNum));
  const visibleData = filteredData.filter(d => d.timeNum >= currentMin && d.timeNum <= currentMax);
  const dataMax = visibleData.length > 0 ? Math.max(...visibleData.map(d => d.value)) : 0;
  
  let yMax = Math.max(dataMax, thresholds.yellowMax * 1.1);
  if (yMax <= 0) yMax = 100;

  const greenStop = (thresholds.greenMax / yMax) * 100;
  const yellowStop = (thresholds.yellowMax / yMax) * 100;

  const zoom = () => {
    if (refAreaLeft === refAreaRight || refAreaRight === null || refAreaLeft === null) {
      setRefAreaLeft(null); setRefAreaRight(null);
      return;
    }
    let [l, r] = [refAreaLeft, refAreaRight];
    if (l > r) [l, r] = [r, l];
    setRefAreaLeft(null); setRefAreaRight(null);
    onZoom(l, r);
  };

  const isMultiDay = (currentMax - currentMin) > 86400000;
  const formatXAxis = (time: number) => {
    const d = new Date(time);
    return isMultiDay ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : d.toLocaleTimeString();
  };

  const gradientId = `grad-${metricKey.replace(/[^a-zA-Z0-9]/g, '-')}`;

  return (
    <div className="h-64 w-full select-none">
      <h4 className="text-center text-sm font-bold mb-2 dark:text-gray-300 uppercase tracking-wider">{metricKey}</h4>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={filteredData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}
            onMouseDown={(e) => e && setRefAreaLeft(Number(e.activeLabel))}
            onMouseMove={(e) => refAreaLeft && e && setRefAreaRight(Number(e.activeLabel))}
            onMouseUp={zoom}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset={`${Math.max(0, 100 - yellowStop)}%`} stopColor="#ef4444" />
              <stop offset={`${Math.max(0, 100 - yellowStop)}%`} stopColor="#eab308" />
              <stop offset={`${Math.max(0, 100 - greenStop)}%`} stopColor="#eab308" />
              <stop offset={`${Math.max(0, 100 - greenStop)}%`} stopColor="#22c55e" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
          <XAxis dataKey="timeNum" type="number" domain={[currentMin, currentMax]} tickFormatter={formatXAxis} hide />
          <YAxis domain={[0, yMax]} width={40} tick={{fontSize: 10}} />
          <Tooltip labelFormatter={(t) => new Date(t).toLocaleString()} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
          <Line type="linear" dataKey="value" stroke={`url(#${gradientId})`} strokeWidth={3} dot={false} activeDot={{ r: 4 }} animationDuration={300} />
          {refAreaLeft && refAreaRight && <ReferenceArea x1={refAreaLeft} x2={refAreaRight} fillOpacity={0.1} fill="#6366f1" />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MetricsChart;
