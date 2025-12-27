import React, { useState, useEffect } from 'react';
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

  const filteredData = React.useMemo(() => data
    .filter(d => d.key === metricKey && d.metric_type === 'gauge')
    .map(d => ({
        ...d,
        timeNum: new Date(d.timestamp).getTime()
    })), [data, metricKey]);

  if (filteredData.length === 0) return null;

  const zoom = () => {
    if (refAreaLeft === refAreaRight || refAreaRight === null || refAreaLeft === null) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }

    // Ensure left is smaller than right
    let newLeft = refAreaLeft;
    let newRight = refAreaRight;
    if (newLeft > newRight) [newLeft, newRight] = [newRight, newLeft];

    setRefAreaLeft(null);
    setRefAreaRight(null);
    
    // Notify parent
    onZoom(newLeft, newRight);
  };

  // Determine thresholds
  const lastRecordWithConfig = [...filteredData].reverse().find(d => d.yellow_at != null || d.red_at != null);
  const yellowAt = lastRecordWithConfig?.yellow_at;
  const redAt = lastRecordWithConfig?.red_at;

  // Check time span (based on current domain view or full data if auto)
  const currentMin = typeof domain[0] === 'number' ? domain[0] : Math.min(...filteredData.map(d => d.timeNum));
  const currentMax = typeof domain[1] === 'number' ? domain[1] : Math.max(...filteredData.map(d => d.timeNum));
  const isMultiDay = (currentMax - currentMin) > 86400000;

  // Calculate yMax based on visible data
  const visibleData = filteredData.filter(d => d.timeNum >= currentMin && d.timeNum <= currentMax);
  const visibleMax = visibleData.length > 0 ? Math.max(...visibleData.map(d => d.value)) : 0;

  let yMax = visibleMax;
  if (yellowAt != null) yMax = Math.max(yMax, yellowAt);
  if (redAt != null) yMax = Math.max(yMax, redAt);
  yMax = yMax * 1.1;
  if (yMax === 0) yMax = 10;

  const yTicks = Array.from({ length: 6 }, (_, i) => parseFloat((yMax * (i / 5)).toFixed(2)));

  const formatXAxis = (timeNum: number) => {
    const date = new Date(timeNum);
    if (isMultiDay) {
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleTimeString();
  };

  return (
    <div className="h-80 w-full relative select-none">
      <h4 className="text-center font-semibold mb-2 dark:text-gray-200">{metricKey}</h4>
      
      <ResponsiveContainer width="100%" height="100%">
        <LineChart 
            data={filteredData} 
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            onMouseDown={(e) => e && setRefAreaLeft(Number(e.activeLabel))}
            onMouseMove={(e) => refAreaLeft && e && setRefAreaRight(Number(e.activeLabel))}
            onMouseUp={zoom}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#ccc" strokeOpacity={0.3} />
          <XAxis
            allowDataOverflow
            dataKey="timeNum"
            type="number"
            domain={[currentMin, currentMax]}
            tickFormatter={formatXAxis}
            minTickGap={30}
            stroke="#888"
          />
          <YAxis 
            allowDataOverflow 
            domain={[0, yMax]} 
            stroke="#888" 
            ticks={yTicks}
            minTickGap={20}
          />
          <Tooltip 
            labelFormatter={(label) => new Date(label).toLocaleString()} 
            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
          />
          <Legend />
          
          {/* Background Zones */}
          {(yellowAt != null || redAt != null) && (
             <ReferenceArea 
                y1={0} 
                y2={yellowAt ?? redAt} 
                fill="rgba(34, 197, 94, 0.4)" 
                stroke="none"
             />
          )}
          {yellowAt != null && redAt != null && (
             <ReferenceArea 
                y1={yellowAt} 
                y2={redAt} 
                fill="rgba(234, 179, 8, 0.4)" 
                stroke="none"
             />
          )}
          {redAt != null && (
             <ReferenceArea 
                y1={redAt} 
                y2={yMax} 
                fill="rgba(239, 68, 68, 0.4)" 
                stroke="none"
             />
          )}

          {/* Selection Box */}
          {refAreaLeft && refAreaRight ? (
            <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="rgba(136, 132, 216, 0.3)" />
          ) : null}

          <Line type="monotone" dataKey="value" stroke="#6366f1" activeDot={{ r: 6 }} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default MetricsChart;
